import { eq } from "drizzle-orm";
import { SOCKET_EVENTS } from "@whatsapp-dashboard/shared";
import type { Job } from "bullmq";
import { db } from "../../db/client.js";
import { webhookEvents } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { downloadMedia } from "../../integrations/whatsapp/client.js";
import { getDecryptedWhatsappCredentials, findNumberByWhatsappPhoneNumberId } from "../../modules/numbers/service.js";
import { findOrCreateConversation, touchCustomerActivity } from "../../modules/conversations/service.js";
import { attachDownloadedMedia, recordInboundMessage, updateMessageStatusByWaId } from "../../modules/messages/service.js";
import { mediaStorage } from "../../storage/mediaStorage.js";
import { emitToNumber } from "../../realtime/publisher.js";
import type { WebhookJobData } from "../queues.js";

interface MetaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string };
  video?: { id: string };
  audio?: { id: string };
  document?: { id: string };
  sticker?: { id: string };
}

interface MetaStatus {
  id: string;
  status: string;
  errors?: Array<{ code: number; title: string }>;
}

interface MetaContact {
  wa_id: string;
  profile?: { name?: string };
}

interface MetaChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

interface MetaEnvelope {
  entry?: Array<{ changes?: Array<{ field?: string; value?: MetaChangeValue }> }>;
}

const MEDIA_ID_FIELD_BY_TYPE: Record<string, "image" | "video" | "audio" | "document" | "sticker"> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  sticker: "sticker",
};

async function handleInboundMessages(value: MetaChangeValue) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId || !value.messages?.length) return;

  const number = await findNumberByWhatsappPhoneNumberId(db, phoneNumberId);
  if (!number) {
    logger.warn({ phoneNumberId }, "Inbound WhatsApp message for unknown phone_number_id");
    return;
  }

  const contactByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));

  for (const msg of value.messages) {
    const conversation = await findOrCreateConversation(db, number.id, msg.from, contactByWaId.get(msg.from) ?? null);
    await touchCustomerActivity(db, conversation.id, new Date(Number(msg.timestamp) * 1000));

    const mediaField = MEDIA_ID_FIELD_BY_TYPE[msg.type];
    const mediaId = mediaField ? (msg as unknown as Record<string, { id: string }>)[mediaField]?.id : undefined;

    const messageType = (mediaField ?? (msg.type === "text" ? "text" : "text")) as
      | "text"
      | "image"
      | "video"
      | "audio"
      | "document"
      | "sticker";

    const row = await recordInboundMessage(db, {
      conversationId: conversation.id,
      waMessageId: msg.id,
      messageType,
      body: msg.text?.body ?? null,
      mediaId: mediaId ?? null,
    });

    if (row && mediaId) {
      try {
        const creds = await getDecryptedWhatsappCredentials(db, number.id);
        const { bytes, mimeType } = await downloadMedia({ mediaId, accessToken: creds.accessToken });
        const relativePath = await mediaStorage.save("messages", bytes, mimeType);
        await attachDownloadedMedia(db, row.id, relativePath, mimeType);
      } catch (err) {
        // The media URL is short-lived (~5 min); BullMQ's retry/backoff on this job
        // gives a few more attempts if we raced the expiry or hit a transient error.
        logger.error({ err, messageId: row.id }, "Failed to download WhatsApp media");
        throw err;
      }
    }

    if (row) {
      emitToNumber(number.id, SOCKET_EVENTS.MESSAGE_NEW, { conversationId: conversation.id, messageId: row.id });
    }
  }
}

async function handleStatuses(value: MetaChangeValue) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId || !value.statuses?.length) return;

  const number = await findNumberByWhatsappPhoneNumberId(db, phoneNumberId);
  if (!number) return;

  for (const status of value.statuses) {
    const validStatuses = ["sent", "delivered", "read", "failed"] as const;
    const mapped = validStatuses.includes(status.status as (typeof validStatuses)[number])
      ? (status.status as (typeof validStatuses)[number])
      : "failed";

    const row = await updateMessageStatusByWaId(
      db,
      status.id,
      mapped,
      status.errors?.[0]?.code?.toString(),
      status.errors?.[0]?.title,
    );
    if (row) {
      emitToNumber(number.id, SOCKET_EVENTS.MESSAGE_STATUS, { messageId: row.id, status: mapped });
    }
  }
}

export async function processMetaEvent(job: Job<WebhookJobData>): Promise<void> {
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, job.data.webhookEventId)).limit(1);
  if (!event) {
    logger.warn({ webhookEventId: job.data.webhookEventId }, "meta webhook_events row not found");
    return;
  }

  try {
    const envelope = event.rawPayload as MetaEnvelope;
    for (const entry of envelope.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (!change.value) continue;
        await handleInboundMessages(change.value);
        await handleStatuses(change.value);
      }
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
