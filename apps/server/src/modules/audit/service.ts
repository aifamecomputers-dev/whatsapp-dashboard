import type { Database } from "../../db/client.js";
import { auditLogs } from "../../db/schema.js";

export interface AuditLogInput {
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Records a sensitive action (token view/edit, role change, recording playback/export, login).
 * Fire-and-forget from the caller's perspective is tempting but we await it: an audit trail
 * that can silently fail to write is not a trail worth having.
 */
export async function writeAuditLog(db: Database, input: AuditLogInput): Promise<void> {
  await db.insert(auditLogs).values({
    userId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? {},
    ipAddress: input.ipAddress ?? null,
  });
}
