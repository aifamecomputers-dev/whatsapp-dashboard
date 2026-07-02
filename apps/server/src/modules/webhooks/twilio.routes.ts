import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { webhookEvents } from "../../db/schema.js";
import { getTwilioEventQueue } from "../../queue/queues.js";
import { logger } from "../../lib/logger.js";
import { getCallableAgentsForNumber, getTeamsForNumber } from "../../lib/rbac.js";
import { getDecryptedTwilioCredentials, findNumberByDisplayPhone } from "../numbers/service.js";
import { buildInboundTwiml, buildOutboundTwiml, webhookUrl } from "../../integrations/twilio/client.js";
import {
  createCall,
  getCallByTwilioSid,
  markConsentNoticePlayed,
  parseVoiceIdentity,
  voiceIdentity,
} from "./../calls/service.js";
import { parseFormBody, verifyTwilioSignature } from "./twilio.verify.js";

function fullUrl(request: FastifyRequest): string {
  return new URL(request.url, env.PUBLIC_BASE_URL).toString();
}

async function logWebhookEvent(eventType: string, payload: Record<string, string>, signatureValid: boolean, error?: string) {
  const [row] = await db
    .insert(webhookEvents)
    .values({
      source: "twilio",
      eventType,
      rawPayload: payload,
      signatureValid,
      status: signatureValid ? "pending" : "failed",
      error: error ?? null,
    })
    .returning({ id: webhookEvents.id });
  return row.id;
}

export default async function twilioWebhookRoutes(app: FastifyInstance) {
  // Twilio posts application/x-www-form-urlencoded, not JSON. Signature verification
  // reconstructs the canonical string from parsed params (see twilio.verify.ts), so
  // unlike the Meta webhook we don't need to preserve raw bytes — just decode as text.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  const rateLimitConfig = { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } };

  // Inbound PSTN call ringing a business number: must respond synchronously with TwiML,
  // so this route (unlike the async status/recording callbacks below) does its DB write
  // inline rather than deferring to the worker queue.
  app.post("/webhooks/twilio/voice/inbound", rateLimitConfig, async (request, reply) => {
    const params = parseFormBody(request.body as string);
    const to = params.To;
    const callSid = params.CallSid;

    const number = to ? await findNumberByDisplayPhone(db, to) : null;
    if (!number) {
      await logWebhookEvent("voice.inbound", params, false, `No phone number matches To=${to}`);
      reply.status(404).type("text/xml");
      return '<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not configured.</Say><Hangup/></Response>';
    }

    const creds = await getDecryptedTwilioCredentials(db, number.id);
    const signatureValid = verifyTwilioSignature({
      authToken: creds.authToken,
      signatureHeader: request.headers["x-twilio-signature"] as string | undefined,
      url: fullUrl(request),
      body: params,
    });

    if (!signatureValid) {
      await logWebhookEvent("voice.inbound", params, false, "Invalid X-Twilio-Signature");
      logger.warn({ numberId: number.id, callSid }, "Rejected Twilio inbound webhook: bad signature");
      reply.status(401).type("text/xml");
      return '<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>';
    }

    const teamIds = await getTeamsForNumber(db, number.id);
    const agentUserIds = await getCallableAgentsForNumber(db, number.id);
    const agentIdentities = agentUserIds.map((userId) => voiceIdentity(number.id, userId));

    const call = await createCall(db, {
      numberId: number.id,
      twilioCallSid: callSid,
      direction: "inbound",
      fromNumber: params.From,
      toNumber: params.To,
      teamId: teamIds[0] ?? null,
      status: "ringing",
    });
    if (call) {
      // Best-effort: the consent line is the first verb in the TwiML we return below,
      // so it always plays before the Dial connects. True "did it actually finish
      // playing" confirmation would require a <Say> completion callback, which Twilio
      // does not offer for this verb — this is logged at TwiML-issuance time as the
      // practical proxy for "the caller was notified before being connected."
      await markConsentNoticePlayed(db, call.id);
    }
    await logWebhookEvent("voice.inbound", params, true);

    const twiml = buildInboundTwiml({
      agentIdentities,
      recordingStatusCallbackUrl: webhookUrl("/webhooks/twilio/voice/recording-status"),
    });
    reply.type("text/xml");
    return twiml;
  });

  // Voice URL for the shared TwiML App used by the browser Voice SDK for outbound
  // (click-to-call) calls. The dashboard passes `NumberId` and `CalleeNumber` as custom
  // connect() params, which arrive here as ordinary form fields.
  app.post("/webhooks/twilio/voice/outbound", rateLimitConfig, async (request, reply) => {
    const params = parseFormBody(request.body as string);
    const numberId = params.NumberId;
    const calleeNumber = params.CalleeNumber;
    const callSid = params.CallSid;

    if (!numberId || !calleeNumber) {
      await logWebhookEvent("voice.outbound", params, false, "Missing NumberId or CalleeNumber param");
      reply.status(400).type("text/xml");
      return '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Call could not be placed.</Say><Hangup/></Response>';
    }

    const identity = parseVoiceIdentity(params.From?.replace(/^client:/, "") ?? "");
    if (!identity || identity.numberId !== numberId) {
      await logWebhookEvent("voice.outbound", params, false, "Caller identity does not match NumberId");
      reply.status(403).type("text/xml");
      return '<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>';
    }

    const creds = await getDecryptedTwilioCredentials(db, numberId);
    const signatureValid = verifyTwilioSignature({
      authToken: creds.authToken,
      signatureHeader: request.headers["x-twilio-signature"] as string | undefined,
      url: fullUrl(request),
      body: params,
    });
    if (!signatureValid) {
      await logWebhookEvent("voice.outbound", params, false, "Invalid X-Twilio-Signature");
      reply.status(401).type("text/xml");
      return '<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>';
    }

    const teamIds = await getTeamsForNumber(db, numberId);
    const call = await createCall(db, {
      numberId,
      twilioCallSid: callSid,
      direction: "outbound",
      fromNumber: params.CallerId ?? "",
      toNumber: calleeNumber,
      teamId: teamIds[0] ?? null,
      agentId: identity.userId,
      status: "ringing",
    });
    if (call) await markConsentNoticePlayed(db, call.id);
    await logWebhookEvent("voice.outbound", params, true);

    const numberRow = await findNumberByDisplayPhone(db, params.CallerId ?? "");
    const twiml = buildOutboundTwiml({
      calleeNumber,
      callerId: numberRow?.displayPhoneNumber ?? params.CallerId ?? "",
      recordingStatusCallbackUrl: webhookUrl("/webhooks/twilio/voice/recording-status"),
    });
    reply.type("text/xml");
    return twiml;
  });

  // Async status/recording callbacks: unlike the routes above, these don't need to
  // return TwiML — just a 200 ack — so real processing is deferred to the worker,
  // matching the same ingest/verify/enqueue pattern used for Meta webhooks.
  app.post("/webhooks/twilio/voice/call-status", rateLimitConfig, async (request, reply) => {
    const params = parseFormBody(request.body as string);
    const callSid = params.CallSid;
    const existingCall = callSid ? await getCallByTwilioSid(db, callSid) : null;

    if (!existingCall) {
      await logWebhookEvent("voice.status", params, false, `No call row for CallSid=${callSid}`);
      reply.status(200);
      return { received: true };
    }

    const creds = await getDecryptedTwilioCredentials(db, existingCall.numberId);
    const signatureValid = verifyTwilioSignature({
      authToken: creds.authToken,
      signatureHeader: request.headers["x-twilio-signature"] as string | undefined,
      url: fullUrl(request),
      body: params,
    });

    const webhookEventId = await logWebhookEvent(
      "voice.status",
      params,
      signatureValid,
      signatureValid ? undefined : "Invalid X-Twilio-Signature",
    );

    if (!signatureValid) {
      reply.status(401);
      return { error: "invalid_signature" };
    }

    await getTwilioEventQueue().add("call-status", { webhookEventId });
    reply.status(200);
    return { received: true };
  });

  app.post("/webhooks/twilio/voice/recording-status", rateLimitConfig, async (request, reply) => {
    const params = parseFormBody(request.body as string);
    const callSid = params.CallSid;
    const existingCall = callSid ? await getCallByTwilioSid(db, callSid) : null;

    if (!existingCall) {
      await logWebhookEvent("voice.recording", params, false, `No call row for CallSid=${callSid}`);
      reply.status(200);
      return { received: true };
    }

    const creds = await getDecryptedTwilioCredentials(db, existingCall.numberId);
    const signatureValid = verifyTwilioSignature({
      authToken: creds.authToken,
      signatureHeader: request.headers["x-twilio-signature"] as string | undefined,
      url: fullUrl(request),
      body: params,
    });

    const webhookEventId = await logWebhookEvent(
      "voice.recording",
      params,
      signatureValid,
      signatureValid ? undefined : "Invalid X-Twilio-Signature",
    );

    if (!signatureValid) {
      reply.status(401);
      return { error: "invalid_signature" };
    }

    await getTwilioEventQueue().add("recording-status", { webhookEventId });
    reply.status(200);
    return { received: true };
  });
}
