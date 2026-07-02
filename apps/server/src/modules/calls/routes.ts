import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { requireNumberAccess } from "../../lib/rbac.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { writeAuditLog } from "../audit/service.js";
import { getDecryptedTwilioCredentials } from "../numbers/service.js";
import { generateVoiceAccessToken } from "../../integrations/twilio/client.js";
import { mediaStorage } from "../../storage/mediaStorage.js";
import { getCallOr404, listCallsForNumber, voiceIdentity } from "./service.js";

function serialize(row: Awaited<ReturnType<typeof getCallOr404>>) {
  return {
    id: row.id,
    numberId: row.numberId,
    direction: row.direction,
    fromNumber: row.fromNumber,
    toNumber: row.toNumber,
    teamId: row.teamId,
    agentId: row.agentId,
    status: row.status,
    durationSeconds: row.durationSeconds,
    hasRecording: Boolean(row.recordingLocalPath),
    recordingDurationSeconds: row.recordingDurationSeconds,
    consentNoticePlayed: row.consentNoticePlayed,
    startedAt: row.startedAt?.toISOString() ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

export default async function callsRoutes(app: FastifyInstance) {
  app.get("/api/numbers/:numberId/calls", { preHandler: app.authenticate }, async (request) => {
    const { numberId } = request.params as { numberId: string };
    await requireNumberAccess(db, request.authUser, numberId);
    const rows = await listCallsForNumber(db, numberId);
    return { calls: rows.map(serialize) };
  });

  app.get("/api/calls/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const row = await getCallOr404(db, id);
    await requireNumberAccess(db, request.authUser, row.numberId);
    return { call: serialize(row) };
  });

  // Recordings are never served from a public URL — only via this authenticated,
  // RBAC-checked, audit-logged route. Playback/export of a call recording is exactly
  // the kind of sensitive action Section 7 of the plan calls out for audit logging.
  app.get("/api/calls/:id/recording", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getCallOr404(db, id);
    await requireNumberAccess(db, request.authUser, row.numberId);
    if (!row.recordingLocalPath) throw new NotFoundError("No recording is available for this call");

    await writeAuditLog(db, {
      userId: request.authUser.id,
      action: "call.recording.play",
      resourceType: "call",
      resourceId: id,
      ipAddress: request.ip,
    });

    const absolutePath = mediaStorage.absolutePath(row.recordingLocalPath);
    reply.type("audio/mpeg");
    return reply.send(createReadStream(absolutePath));
  });

  app.get("/api/numbers/:numberId/voice-token", { preHandler: app.authenticate }, async (request) => {
    const { numberId } = request.params as { numberId: string };
    await requireNumberAccess(db, request.authUser, numberId);

    const creds = await getDecryptedTwilioCredentials(db, numberId);
    if (!creds.apiKeySid || !creds.apiKeySecret || !creds.twimlAppSid) {
      throw new ValidationError("This number is missing Twilio API Key / TwiML App configuration");
    }

    const token = generateVoiceAccessToken({
      accountSid: creds.accountSid,
      apiKeySid: creds.apiKeySid,
      apiKeySecret: creds.apiKeySecret,
      twimlAppSid: creds.twimlAppSid,
      identity: voiceIdentity(numberId, request.authUser.id),
    });

    return { token, identity: voiceIdentity(numberId, request.authUser.id) };
  });
}
