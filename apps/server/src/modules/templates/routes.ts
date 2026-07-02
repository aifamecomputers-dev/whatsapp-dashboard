import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { requireNumberAccess } from "../../lib/rbac.js";
import { listTemplatesForNumber, syncTemplatesForNumber } from "./service.js";

export default async function templatesRoutes(app: FastifyInstance) {
  app.get("/api/numbers/:numberId/templates", { preHandler: app.authenticate }, async (request) => {
    const { numberId } = request.params as { numberId: string };
    await requireNumberAccess(db, request.authUser, numberId);
    return { templates: await listTemplatesForNumber(db, numberId) };
  });

  app.post("/api/numbers/:numberId/templates/sync", { preHandler: app.authenticate }, async (request) => {
    const { numberId } = request.params as { numberId: string };
    await requireNumberAccess(db, request.authUser, numberId);
    return { templates: await syncTemplatesForNumber(db, numberId) };
  });
}
