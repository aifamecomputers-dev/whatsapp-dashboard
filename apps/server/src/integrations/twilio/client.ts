import twilio from "twilio";
import { env } from "../../config/env.js";

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

const VOICE_TOKEN_TTL_SECONDS = 3600;

export function generateVoiceAccessToken(params: {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  identity: string;
}): string {
  const token = new AccessToken(params.accountSid, params.apiKeySid, params.apiKeySecret, {
    identity: params.identity,
    ttl: VOICE_TOKEN_TTL_SECONDS,
  });
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: params.twimlAppSid,
      incomingAllow: true,
    }),
  );
  return token.toJwt();
}

const DEFAULT_CONSENT_TEXT = "This call may be recorded for quality and training purposes.";

/** TwiML for an inbound PSTN call ringing into the browser clients of eligible agents. */
export function buildInboundTwiml(params: {
  consentText?: string;
  agentIdentities: string[];
  recordingStatusCallbackUrl: string;
}): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say(params.consentText ?? DEFAULT_CONSENT_TEXT);

  if (params.agentIdentities.length === 0) {
    response.say("No agents are available to take this call right now. Please try again later.");
    response.hangup();
    return response.toString();
  }

  const dial = response.dial({
    record: "record-from-answer-dual",
    recordingStatusCallback: params.recordingStatusCallbackUrl,
    recordingStatusCallbackEvent: ["completed"],
  });
  for (const identity of params.agentIdentities) {
    dial.client(identity);
  }
  return response.toString();
}

/** TwiML for an agent-initiated outbound (click-to-call) call, invoked as the TwiML App's Voice URL. */
export function buildOutboundTwiml(params: {
  consentText?: string;
  calleeNumber: string;
  callerId: string;
  recordingStatusCallbackUrl: string;
}): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say(params.consentText ?? DEFAULT_CONSENT_TEXT);
  const dial = response.dial({
    callerId: params.callerId,
    record: "record-from-answer-dual",
    recordingStatusCallback: params.recordingStatusCallbackUrl,
    recordingStatusCallbackEvent: ["completed"],
  });
  dial.number(params.calleeNumber);
  return response.toString();
}

/**
 * Twilio's hosted recording URL requires Basic Auth with the account's SID/auth token
 * and has its own retention policy — we fetch and persist the bytes ourselves rather
 * than storing only the remote URL long-term.
 */
export async function fetchRecordingAudio(params: {
  accountSid: string;
  authToken: string;
  recordingSid: string;
}): Promise<{ bytes: Buffer; mimeType: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${params.accountSid}/Recordings/${params.recordingSid}.mp3`;
  const auth = Buffer.from(`${params.accountSid}:${params.authToken}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    throw new Error(`Failed to download Twilio recording ${params.recordingSid} (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { bytes: Buffer.from(arrayBuffer), mimeType: "audio/mpeg" };
}

export function webhookUrl(path: string): string {
  return new URL(path, env.PUBLIC_BASE_URL).toString();
}
