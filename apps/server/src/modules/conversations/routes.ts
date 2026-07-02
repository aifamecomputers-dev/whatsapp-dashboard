import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CONVERSATION_STATUSES } from "@whatsapp-dashboard/shared";
import { db } from "../../db/client.js";
import { requireNumberAccess } from "../../lib/rbac.js";
import { ValidationError } from "../../lib/errors.js";
import {
  assignAgent,
  getConversationOr404,
  listConversationsForNumber,
  sessionExpiresAt,
  setConversationStatus,
} from "./service.js";

function serialize(row: Awaited<ReturnType<typeof getConversationOr404>>) {
  return {
    id: row.id,
    numberId: row.numberId,
    contactWaId: row.contactWaId,
    contactName: row.contactName,
    status: row.status,
    assignedAgentId: row.assignedAgentId,
    lastCustomerMessageAt: row.lastCustomerMessageAt?.toISOString() ?? null,
    sessionExpiresAt: sessionExpiresAt(row.lastCustomerMessageAt)?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const patchSchema = z.object({
  assignedAgentId: z.string().uuid().nullable().optional(),
  status: z.enum(CONVERSATION_STATUSES).optional(),
});

export default async function conversationsRoutes(app: FastifyInstance) {
  app.get("/api/numbers/:numberId/conversations", { preHandler: app.authenticate }, async (request) => {
    const { numberId } = request.params as { numberId: string };
    await requireNumberAccess(db, request.authUser, numberId);
    const rows = await listConversationsForNumber(db, numberId);
    return { conversations: rows.map(serialize) };
  });

  app.get("/api/conversations/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const row = await getConversationOr404(db, id);
    await requireNumberAccess(db, request.authUser, row.numberId);
    return { conversation: serialize(row) };
  });

  app.patch("/api/conversations/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await getConversationOr404(db, id);
    await requireNumberAccess(db, request.authUser, existing.numberId);

    const body = patchSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);

    let row = existing;
    if (body.data.assignedAgentId !== undefined) {
      row = await assignAgent(db, id, body.data.assignedAgentId);
    }
    if (body.data.status) {
      row = await setConversationStatus(db, id, body.data.status);
    }
    return { conversation: serialize(row) };
  });
}
