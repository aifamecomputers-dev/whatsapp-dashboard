import { eq } from "drizzle-orm";
import { SOCKET_EVENTS, type CallStatus } from "@whatsapp-dashboard/shared";
import type { Job } from "bullmq";
import { db } from "../../db/client.js";
import { webhookEvents } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { fetchRecordingAudio } from "../../integrations/twilio/client.js";
import { getDecryptedTwilioCredentials } from "../../modules/numbers/service.js";
import { attachRecording, getCallByTwilioSid, updateCallStatus } from "../../modules/calls/service.js";
import { mediaStorage } from "../../storage/mediaStorage.js";
import { emitToNumber } from "../../realtime/publisher.js";
import type { WebhookJobData } from "../queues.js";

const VALID_CALL_STATUSES: readonly CallStatus[] = [
  "queued",
  "ringing",
  "in-progress",
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
];

async function handleCallStatus(params: Record<string, string>) {
  const callSid = params.CallSid;
  if (!callSid) return;

  const status = params.CallStatus as CallStatus;
  if (!VALID_CALL_STATUSES.includes(status)) {
    logger.warn({ callSid, status: params.CallStatus }, "Unrecognized Twilio CallStatus");
    return;
  }

  const durationSeconds = params.CallDuration ? Number(params.CallDuration) : undefined;
  const row = await updateCallStatus(db, callSid, status, durationSeconds);
  if (row) {
    emitToNumber(row.numberId, SOCKET_EVENTS.CALL_STATUS, { callId: row.id, status });
  }
}

async function handleRecordingStatus(params: Record<string, string>) {
  const callSid = params.CallSid;
  const recordingSid = params.RecordingSid;
  if (!callSid || !recordingSid) return;

  const call = await getCallByTwilioSid(db, callSid);
  if (!call) {
    logger.warn({ callSid }, "Recording callback for unknown call");
    return;
  }

  const creds = await getDecryptedTwilioCredentials(db, call.numberId);
  const { bytes, mimeType } = await fetchRecordingAudio({
    accountSid: creds.accountSid,
    authToken: creds.authToken,
    recordingSid,
  });
  const relativePath = await mediaStorage.save("recordings", bytes, mimeType);

  const durationSeconds = params.RecordingDuration ? Number(params.RecordingDuration) : 0;
  const updated = await attachRecording(db, callSid, {
    recordingSid,
    recordingLocalPath: relativePath,
    recordingDurationSeconds: durationSeconds,
  });

  if (updated) {
    emitToNumber(updated.numberId, SOCKET_EVENTS.CALL_RECORDING_READY, { callId: updated.id });
  }
}

export async function processTwilioEvent(job: Job<WebhookJobData>): Promise<void> {
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, job.data.webhookEventId)).limit(1);
  if (!event) {
    logger.warn({ webhookEventId: job.data.webhookEventId }, "twilio webhook_events row not found");
    return;
  }

  try {
    const params = event.rawPayload as Record<string, string>;
    if (event.eventType === "voice.status") {
      await handleCallStatus(params);
    } else if (event.eventType === "voice.recording") {
      await handleRecordingStatus(params);
    }
    await db
      .update(webhookEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(webhookEvents.id, event.id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.id, event.id));
    throw err;
  }
}
