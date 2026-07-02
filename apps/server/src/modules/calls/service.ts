import { desc, eq } from "drizzle-orm";
import type { CallDirection, CallStatus, ConsentEvent } from "@whatsapp-dashboard/shared";
import type { Database } from "../../db/client.js";
import { calls, consentLogs } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";

/**
 * Twilio <Client> identities are scoped per-number (`{numberId}:{userId}`) rather than
 * just the raw user id, because one agent can be eligible to receive calls for several
 * numbers that may sit on different Twilio subaccounts/TwiML Apps — the identity has to
 * disambiguate which number's Voice SDK registration a given call should ring.
 */
export function voiceIdentity(numberId: string, userId: string): string {
  return `${numberId}__${userId}`;
}

export function parseVoiceIdentity(identity: string): { numberId: string; userId: string } | null {
  const [numberId, userId] = identity.split("__");
  if (!numberId || !userId) return null;
  return { numberId, userId };
}

export async function listCallsForNumber(db: Database, numberId: string) {
  return db.select().from(calls).where(eq(calls.numberId, numberId)).orderBy(desc(calls.createdAt));
}

export async function getCallOr404(db: Database, callId: string) {
  const [row] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!row) throw new NotFoundError("Call not found");
  return row;
}

export async function getCallByTwilioSid(db: Database, twilioCallSid: string) {
  const [row] = await db.select().from(calls).where(eq(calls.twilioCallSid, twilioCallSid)).limit(1);
  return row ?? null;
}

export interface CreateCallInput {
  numberId: string;
  twilioCallSid: string;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  teamId?: string | null;
  agentId?: string | null;
  status: CallStatus;
}

export async function createCall(db: Database, input: CreateCallInput) {
  const [row] = await db
    .insert(calls)
    .values({
      numberId: input.numberId,
      twilioCallSid: input.twilioCallSid,
      direction: input.direction,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      teamId: input.teamId ?? null,
      agentId: input.agentId ?? null,
      status: input.status,
      startedAt: new Date(),
    })
    .onConflictDoNothing({ target: calls.twilioCallSid })
    .returning();
  return row ?? (await getCallByTwilioSid(db, input.twilioCallSid));
}

export async function updateCallStatus(
  db: Database,
  twilioCallSid: string,
  status: CallStatus,
  durationSeconds?: number,
) {
  const patch: Record<string, unknown> = { status };
  if (durationSeconds !== undefined) patch.durationSeconds = durationSeconds;
  if (status === "in-progress") patch.answeredAt = new Date();
  if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) patch.endedAt = new Date();

  const [row] = await db.update(calls).set(patch).where(eq(calls.twilioCallSid, twilioCallSid)).returning();
  return row ?? null;
}

export async function attachRecording(
  db: Database,
  twilioCallSid: string,
  input: { recordingSid: string; recordingLocalPath: string; recordingDurationSeconds: number },
) {
  const [row] = await db
    .update(calls)
    .set({
      recordingSid: input.recordingSid,
      recordingLocalPath: input.recordingLocalPath,
      recordingDurationSeconds: input.recordingDurationSeconds,
    })
    .where(eq(calls.twilioCallSid, twilioCallSid))
    .returning();
  return row ?? null;
}

export async function markConsentNoticePlayed(db: Database, callId: string): Promise<void> {
  await db.update(calls).set({ consentNoticePlayed: true }).where(eq(calls.id, callId));
  await recordConsentEvent(db, callId, "notice_played");
}

export async function recordConsentEvent(
  db: Database,
  callId: string,
  event: ConsentEvent,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(consentLogs).values({ callId, event, metadata });
}
