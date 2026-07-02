import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { env } from "../../config/env.js";
import { UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { writeAuditLog } from "../audit/service.js";
import { findUserByEmail, issueRefreshToken, rotateRefreshToken, revokeRefreshToken, verifyPassword } from "./service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const REFRESH_COOKIE = "refresh_token";
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
};

export default async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError("Invalid email or password format");

    const user = await findUserByEmail(db, body.data.email);
    if (!user) throw new UnauthorizedError("Invalid email or password");

    const passwordOk = await verifyPassword(body.data.password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedError("Invalid email or password");

    const accessToken = app.jwt.sign({ sub: user.id });
    const refreshToken = await issueRefreshToken(db, user.id);

    await writeAuditLog(db, {
      userId: user.id,
      action: "login",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: request.ip,
    });

    reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin },
    };
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    if (!presented) throw new UnauthorizedError("No refresh token presented");

    const { userId, newToken } = await rotateRefreshToken(db, presented);
    const accessToken = app.jwt.sign({ sub: userId });

    reply.setCookie(REFRESH_COOKIE, newToken, refreshCookieOptions);
    return { accessToken };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    if (presented) await revokeRefreshToken(db, presented);
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: app.authenticate }, async (request) => {
    return { user: request.authUser };
  });
}
