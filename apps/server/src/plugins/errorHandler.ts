import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({ error: error.code, message: error.message });
      return;
    }

    // Fastify schema validation errors carry a `validation` array
    if ((error as { validation?: unknown }).validation) {
      reply.status(400).send({ error: "validation_error", message: error.message });
      return;
    }

    logger.error({ err: error, url: request.url, method: request.method }, "Unhandled error");
    reply.status(500).send({ error: "internal_error", message: "An unexpected error occurred" });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: "not_found", message: `Route ${request.method} ${request.url} not found` });
  });
});
