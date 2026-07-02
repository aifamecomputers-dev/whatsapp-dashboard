import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { messageTemplates } from "../../db/schema.js";
import { listApprovedTemplates } from "../../integrations/whatsapp/client.js";
import { getDecryptedWhatsappCredentials } from "../numbers/service.js";

export async function listTemplatesForNumber(db: Database, numberId: string) {
  return db.select().from(messageTemplates).where(eq(messageTemplates.numberId, numberId));
}

/** Pulls the current approved/pending template catalog from Meta and upserts it locally. */
export async function syncTemplatesForNumber(db: Database, numberId: string) {
  const creds = await getDecryptedWhatsappCredentials(db, numberId);
  const remote = await listApprovedTemplates({ wabaId: creds.wabaId, accessToken: creds.accessToken });

  for (const tpl of remote) {
    await db
      .insert(messageTemplates)
      .values({
        numberId,
        name: tpl.name,
        language: tpl.language,
        category: tpl.category,
        status: tpl.status,
        components: tpl.components,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [messageTemplates.numberId, messageTemplates.name, messageTemplates.language],
        set: {
          category: tpl.category,
          status: tpl.status,
          components: tpl.components,
          syncedAt: new Date(),
        },
      });
  }

  return listTemplatesForNumber(db, numberId);
}
