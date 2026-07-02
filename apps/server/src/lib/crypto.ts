import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM

const masterKey = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "hex");

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Encrypts a secret (e.g. a per-number WhatsApp or Twilio credential) for storage.
 * Never call this on values that will be echoed back to the browser in plaintext.
 */
export function encryptSecret(plaintext: string): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(ALGORITHM, masterKey, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Masks a secret for display in the admin UI, e.g. "EAAxxxx...9f2a". */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "****";
  return `${plaintext.slice(0, 4)}${"*".repeat(8)}${plaintext.slice(-4)}`;
}

/** Constant-time comparison of two hex/base64-encoded MACs to prevent timing attacks. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
