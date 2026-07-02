import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { webhookEvents } from "../../db/schema.js";
import { getMetaEventQueue } from "../../queue/queues.js";
import { logger } from "../../lib/logger.js";
import { resolveWebhookChallenge, verifyMetaSignature } from "./meta.verify.js";

interface MetaWebhookEnvelope {
  entry?: Array<{ changes?: Array<{ field?: string }> }>;
}

function extractEventType(payload: unknown): string {
  const envelope = payload as MetaWebhookEnvelope;
  return envelope?.entry?.[0]?.changes?.[0]?.field ?? "unknown";
}

export default async function metaWebhookRoutes(app: FastifyInstance) {
  // Scoped to this encapsulated plugin only: we need the *raw* bytes to compute the
  // HMAC before any JSON parsing happens, so this overrides Fastify's default JSON
  // parser just for routes registered in this file.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.get("/webhooks/meta", async (request, reply) => {
    const challenge = resolveWebhookChallenge(request.query as Record<string, unknown>);
    if (challenge === null) {
      reply.status(403);
      return { error: "forbidden" };
    }
    reply.type("text/plain");
    return challenge;
  });

  app.post(
    "/webhooks/meta",
    { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const rawBody = request.body as Buffer;
      const signatureHeader = request.headers["x-hub-signature-256"] as string | undefined;
      const signatureValid = verifyMetaSignature(rawBody, signatureHeader);

      let payload: unknown = {};
      try {
        payload = rawBody.length > 0 ? JSON.parse(rawBody.toString("utf8")) : {};
      } catch {
        logger.warn("Received Meta webhook with unparsable JSON body");
      }

      const [event] = await db
        .insert(webhookEvents)
        .values({
          source: "meta",
          eventType: extractEventType(payload),
          rawPayload: payload as object,
          signatureValid,
          status: signatureValid ? "pending" : "failed",
          error: signatureValid ? null : "Invalid or missing X-Hub-Signature-256",
        })
        .returning({ id: webhookEvents.id });

      if (!signatureValid) {
        logger.warn({ webhookEventId: event.id }, "Rejected Meta webhook: signature verification failed");
        reply.status(401);
        return { error: "invalid_signature" };
      }

      // Ack fast; all real processing (DB writes, media download, socket broadcast)
      // happens in server-worker so Meta's webhook delivery never waits on it.
      await getMetaEventQueue().add("process", { webhookEventId: event.id });
      reply.status(200);
      return { received: true };
    },
  );
}
