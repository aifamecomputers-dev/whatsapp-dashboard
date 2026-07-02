import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

/** Verifies X-Hub-Signature-256 against the raw (unparsed) request body. Must run before any JSON parsing. */
export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex")}`;

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/** Handles the one-time GET subscription handshake Meta performs when the webhook URL is configured. */
export function resolveWebhookChallenge(query: Record<string, unknown>): string | null {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (mode === "subscribe" && token === env.META_WEBHOOK_VERIFY_TOKEN && typeof challenge === "string") {
    return challenge;
  }
  return null;
}
