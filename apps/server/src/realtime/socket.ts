import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type DefaultEventsMap } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { createRedisConnection } from "../queue/connection.js";
import { getAccessibleNumberIds, getAccessibleTeamIds, loadAuthenticatedUser, type AuthenticatedUser } from "../lib/rbac.js";
import { logger } from "../lib/logger.js";

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

interface AuthenticatedSocketData {
  user: AuthenticatedUser;
}

type AppSocketIOServer = SocketIOServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, AuthenticatedSocketData>;

export function initRealtime(httpServer: HttpServer): AppSocketIOServer {
  const io: AppSocketIOServer = new SocketIOServer(httpServer, {
    cors: { origin: env.NODE_ENV === "production" ? env.PUBLIC_BASE_URL : true, credentials: true },
    path: "/socket.io",
  });

  const pubClient = createRedisConnection();
  // duplicate() copies connection options but not event listeners, so the
  // subscriber client needs its own 'error' handler too (see connection.ts).
  const subClient = pubClient.duplicate();
  subClient.on("error", (err) => logger.error({ err }, "Redis subscriber connection error"));
  io.adapter(createAdapter(pubClient, subClient));

  // Auth: the client passes the short-lived access token (the same one used for
  // REST calls) via `socket.handshake.auth.token`. If it expires mid-session the
  // socket is not force-disconnected here — the client is expected to refresh via
  // /api/auth/refresh and reconnect with a fresh token on its normal reconnect cycle.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error("Missing token");
      const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string };
      const user = await loadAuthenticatedUser(db, decoded.sub);
      if (!user) throw new Error("User not found");
      socket.data.user = user;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { user } = socket.data;

    // Room membership is computed server-side from the exact same RBAC functions
    // the REST layer uses (lib/rbac.ts) — the client cannot request rooms directly,
    // so socket access can never be broader than REST access.
    void (async () => {
      const [numberIds, teamIds] = await Promise.all([
        getAccessibleNumberIds(db, user),
        getAccessibleTeamIds(db, user),
      ]);
      for (const id of numberIds) await socket.join(`number:${id}`);
      for (const id of teamIds) await socket.join(`team:${id}`);
      logger.debug({ userId: user.id, numbers: numberIds.length, teams: teamIds.length }, "socket joined rooms");
    })();

    socket.on("disconnect", () => {
      logger.debug({ userId: user.id }, "socket disconnected");
    });
  });

  return io;
}
