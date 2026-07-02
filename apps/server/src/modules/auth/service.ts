import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { refreshTokens, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../lib/errors.js";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function findUserByEmail(db: Database, email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/** Issues a new opaque refresh token, storing only its hash. Returns the plaintext token to send to the client. */
export async function issueRefreshToken(db: Database, userId: string): Promise<string> {
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return token;
}

/**
 * Validates a presented refresh token, revokes it, and issues a replacement (rotation).
 * Rotation limits the blast radius of a leaked refresh token to a single use.
 */
export async function rotateRefreshToken(db: Database, presentedToken: string): Promise<{ userId: string; newToken: string }> {
  const tokenHash = hashToken(presentedToken);
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .limit(1);

  if (!row || row.expiresAt < new Date()) {
    throw new UnauthorizedError("Refresh token is invalid or expired");
  }

  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
  const newToken = await issueRefreshToken(db, row.userId);
  return { userId: row.userId, newToken };
}

export async function revokeRefreshToken(db: Database, presentedToken: string): Promise<void> {
  const tokenHash = hashToken(presentedToken);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}
