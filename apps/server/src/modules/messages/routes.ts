import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { requireNumberAccess } from "../../lib/rbac.js";
import { ForbiddenError, ValidationError } from "../../lib/errors.js";
import { sendTemplateMessage, sendTextMessage, WhatsAppApiError } from "../../integrations/whatsapp/client.js";
import { getDecryptedWhatsappCredentials } from "../numbers/service.js";
import { getConversationOr404, isSessionOpen } from "../conversations/service.js";
import {
  listMessagesForConversation,
  markMessageFailed,
  markMessageSent,
  recordOutboundMessagePending,
} from "./service.js";

function serialize(row: Awaited<ReturnType<typeof listMessagesForConversation>>[number]) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    waMessageId: row.waMessageId,
    messageType: row.messageType,
    body: row.body,
    mediaLocalPath: row.mediaLocalPath,
    mediaMimeType: row.mediaMimeType,
    templateName: row.templateName,
    status: row.status,
    errorMessage: row.errorMessage,
    sentByUserId: row.sentByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

const sendTextSchema = z.object({
  type: z.literal("text"),
  body: z.string().min(1),
});

const sendTemplateSchema = z.object({
  type: z.literal("template"),
  templateName: z.string().min(1),
  languageCode: z.string().min(1),
  components: z.array(z.unknown()).optional(),
});

const sendSchema = z.discriminatedUnion("type", [sendTextSchema, sendTemplateSchema]);

export default async function messagesRoutes(app: FastifyInstance) {
  app.get("/api/conversations/:id/messages", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const conversation = await getConversationOr404(db, id);
    await requireNumberAccess(db, request.authUser, conversation.numberId);
    const rows = await listMessagesForConversation(db, id);
    return { messages: rows.map(serialize) };
  });

  app.post("/api/conversations/:id/messages", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversation = await getConversationOr404(db, id);
    await requireNumberAccess(db, request.authUser, conversation.numberId);

    const body = sendSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);

    // The 24h customer-service session window is enforced server-side, not just
    // hidden in the UI: free-form text outside the window is rejected by Meta
    // anyway, but failing fast here gives a clear error instead of a Graph API 400.
    if (body.data.type === "text" && !isSessionOpen(conversation.lastCustomerMessageAt)) {
      throw new ForbiddenError(
        "The 24-hour customer service session has expired. Send an approved template message to re-open it.",
      );
    }

    const creds = await getDecryptedWhatsappCredentials(db, conversation.numberId);

    const pending = await recordOutboundMessagePending(db, {
      conversationId: id,
      messageType: body.data.type,
      body: body.data.type === "text" ? body.data.body : null,
      templateName: body.data.type === "template" ? body.data.templateName : null,
      sentByUserId: request.authUser.id,
    });

    try {
      const result =
        body.data.type === "text"
          ? await sendTextMessage({
              phoneNumberId: creds.phoneNumberId,
              accessToken: creds.accessToken,
              to: conversation.contactWaId,
              body: body.data.body,
            })
          : await sendTemplateMessage({
              phoneNumberId: creds.phoneNumberId,
              accessToken: creds.accessToken,
              to: conversation.contactWaId,
              templateName: body.data.templateName,
              languageCode: body.data.languageCode,
              components: body.data.components,
            });

      const waMessageId = result.messages[0]?.id;
      if (waMessageId) await markMessageSent(db, pending.id, waMessageId);
    } catch (err) {
      const message = err instanceof WhatsAppApiError ? err.message : "Failed to send message";
      await markMessageFailed(db, pending.id, message);
      throw new ValidationError(message);
    }

    reply.status(201);
    return { messageId: pending.id };
  });
}
