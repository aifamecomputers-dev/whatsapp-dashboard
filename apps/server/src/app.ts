import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import errorHandlerPlugin from "./plugins/errorHandler.js";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./modules/auth/routes.js";
import usersRoutes from "./modules/users/routes.js";
import teamsRoutes from "./modules/teams/routes.js";
import numbersRoutes from "./modules/numbers/routes.js";
import conversationsRoutes from "./modules/conversations/routes.js";
import messagesRoutes from "./modules/messages/routes.js";
import templatesRoutes from "./modules/templates/routes.js";
import callsRoutes from "./modules/calls/routes.js";
import metaWebhookRoutes from "./modules/webhooks/meta.routes.js";
import twilioWebhookRoutes from "./modules/webhooks/twilio.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
          : undefined,
    },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? env.PUBLIC_BASE_URL : true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false, // applied per-route: strict on auth, generous on webhooks
  });
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);

  // Webhook routes register their own raw-body content-type parser scoped to
  // their prefix, so they must be registered as encapsulated plugins (Fastify
  // keeps content-type parser overrides scoped to the registering context).
  await app.register(metaWebhookRoutes);
  await app.register(twilioWebhookRoutes);

  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(teamsRoutes);
  await app.register(numbersRoutes);
  await app.register(conversationsRoutes);
  await app.register(messagesRoutes);
  await app.register(templatesRoutes);
  await app.register(callsRoutes);

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}
