import { desc, eq } from "drizzle-orm";
import type { CallDirection, CallStatus } from "@whatsapp-dashboard/shared";
import type { Database } from "../../db/client.js";
import { calls } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";

export async function listCallsForNumber(db: Database, numberId: string) {
  return db.select().from(calls).where(eq(calls.numberId, numberId)).orderBy(desc(calls.createdAt));
}

export async function getCallOr404(db: Database, callId: string) {
  const [row] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!row) throw new NotFoundError("Call not found");
  return row;
}

export async function getCallByWhatsappCallId(db: Database, whatsappCallId: string) {
  const [row] = await db.select().from(calls).where(eq(calls.whatsappCallId, whatsappCallId)).limit(1);
  return row ?? null;
}

export interface UpsertCallEventInput {
  numberId: string;
  whatsappCallId: string;
  direction: CallDirection;
  fromWaId: string;
  toWaId: string;
  teamId?: string | null;
  status: CallStatus;
  durationSeconds?: number;
}

/**
 * A call arrives to us as a sequence of events (e.g. ringing → terminated) that
 * share the same whatsapp_call_id — this upserts the log row so later events
 * update status/duration on the same record instead of creating duplicates.
 */
export async function upsertCallEvent(db: Database, input: UpsertCallEventInput) {
  const patch: Record<string, unknown> = {
    numberId: input.numberId,
    direction: input.direction,
    fromWaId: input.fromWaId,
    toWaId: input.toWaId,
    status: input.status,
  };
  if (input.teamId !== undefined) patch.teamId = input.teamId;
  if (input.durationSeconds !== undefined) patch.durationSeconds = input.durationSeconds;
  if (input.status === "ringing") patch.startedAt = new Date();
  if (["missed", "rejected", "terminated", "failed"].includes(input.status)) patch.endedAt = new Date();

  const [row] = await db
    .insert(calls)
    .values({
      numberId: input.numberId,
      whatsappCallId: input.whatsappCallId,
      direction: input.direction,
      fromWaId: input.fromWaId,
      toWaId: input.toWaId,
      teamId: input.teamId ?? null,
      status: input.status,
      durationSeconds: input.durationSeconds,
      startedAt: input.status === "ringing" ? new Date() : undefined,
      endedAt: ["missed", "rejected", "terminated", "failed"].includes(input.status) ? new Date() : undefined,
    })
    .onConflictDoUpdate({ target: calls.whatsappCallId, set: patch })
    .returning();
  return row;
}
