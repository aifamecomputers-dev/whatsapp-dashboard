import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { conversations } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function sessionExpiresAt(lastCustomerMessageAt: Date | null): Date | null {
  if (!lastCustomerMessageAt) return null;
  return new Date(lastCustomerMessageAt.getTime() + SESSION_WINDOW_MS);
}

export function isSessionOpen(lastCustomerMessageAt: Date | null): boolean {
  const expiry = sessionExpiresAt(lastCustomerMessageAt);
  return expiry !== null && expiry.getTime() > Date.now();
}

export async function listConversationsForNumber(db: Database, numberId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.numberId, numberId))
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversationOr404(db: Database, conversationId: string) {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!row) throw new NotFoundError("Conversation not found");
  return row;
}

export async function findOrCreateConversation(
  db: Database,
  numberId: string,
  contactWaId: string,
  contactName: string | null,
) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.numberId, numberId), eq(conversations.contactWaId, contactWaId)))
    .limit(1);

  if (existing) {
    if (contactName && contactName !== existing.contactName) {
      const [updated] = await db
        .update(conversations)
        .set({ contactName, updatedAt: new Date() })
        .where(eq(conversations.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [created] = await db
    .insert(conversations)
    .values({ numberId, contactWaId, contactName, status: "open" })
    .returning();
  return created;
}

export async function touchCustomerActivity(db: Database, conversationId: string, at: Date): Promise<void> {
  await db
    .update(conversations)
    .set({ lastCustomerMessageAt: at, updatedAt: new Date(), status: "open" })
    .where(eq(conversations.id, conversationId));
}

export async function assignAgent(db: Database, conversationId: string, agentId: string | null) {
  const [row] = await db
    .update(conversations)
    .set({ assignedAgentId: agentId, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .returning();
  if (!row) throw new NotFoundError("Conversation not found");
  return row;
}

export async function setConversationStatus(db: Database, conversationId: string, status: "open" | "pending" | "closed") {
  const [row] = await db
    .update(conversations)
    .set({ status, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .returning();
  if (!row) throw new NotFoundError("Conversation not found");
  return row;
}
