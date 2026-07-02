import { asc, eq } from "drizzle-orm";
import type { MessageStatus, MessageType } from "@whatsapp-dashboard/shared";
import type { Database } from "../../db/client.js";
import { messages } from "../../db/schema.js";

export async function listMessagesForConversation(db: Database, conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

export interface RecordInboundMessageInput {
  conversationId: string;
  waMessageId: string;
  messageType: MessageType;
  body?: string | null;
  mediaId?: string | null;
}

export async function recordInboundMessage(db: Database, input: RecordInboundMessageInput) {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      direction: "inbound",
      waMessageId: input.waMessageId,
      messageType: input.messageType,
      body: input.body ?? null,
      mediaId: input.mediaId ?? null,
      status: "delivered",
    })
    .onConflictDoNothing({ target: messages.waMessageId })
    .returning();
  return row ?? null;
}

export async function attachDownloadedMedia(
  db: Database,
  messageId: string,
  mediaLocalPath: string,
  mediaMimeType: string,
): Promise<void> {
  await db.update(messages).set({ mediaLocalPath, mediaMimeType, updatedAt: new Date() }).where(eq(messages.id, messageId));
}

export interface RecordOutboundMessageInput {
  conversationId: string;
  messageType: MessageType;
  body?: string | null;
  templateName?: string | null;
  sentByUserId: string;
}

export async function recordOutboundMessagePending(db: Database, input: RecordOutboundMessageInput) {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      direction: "outbound",
      messageType: input.messageType,
      body: input.body ?? null,
      templateName: input.templateName ?? null,
      sentByUserId: input.sentByUserId,
      status: "pending",
    })
    .returning();
  return row;
}

export async function markMessageSent(db: Database, messageId: string, waMessageId: string): Promise<void> {
  await db
    .update(messages)
    .set({ waMessageId, status: "sent", updatedAt: new Date() })
    .where(eq(messages.id, messageId));
}

export async function markMessageFailed(db: Database, messageId: string, errorMessage: string): Promise<void> {
  await db
    .update(messages)
    .set({ status: "failed", errorMessage, updatedAt: new Date() })
    .where(eq(messages.id, messageId));
}

export async function updateMessageStatusByWaId(
  db: Database,
  waMessageId: string,
  status: MessageStatus,
  errorCode?: string,
  errorMessage?: string,
) {
  const [row] = await db
    .update(messages)
    .set({ status, errorCode, errorMessage, updatedAt: new Date() })
    .where(eq(messages.waMessageId, waMessageId))
    .returning();
  return row ?? null;
}
