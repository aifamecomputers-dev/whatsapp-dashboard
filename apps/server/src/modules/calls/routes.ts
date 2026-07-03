import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { requireNumberAccess } from "../../lib/rbac.js";
import { getCallOr404, listCallsForNumber } from "./service.js";

function serialize(row: Awaited<ReturnType<typeof getCallOr404>>) {
  return {
    id: row.id,
    numberId: row.numberId,
    direction: row.direction,
    fromWaId: row.fromWaId,
    toWaId: row.toWaId,
    teamId: row.teamId,
    status: row.status,
    durationSeconds: row.durationSeconds,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

export default async function callsRoutes(app: FastifyInstance) {
  app.get("/api/numbers/:numberId/calls", { preHandler: app.authenticate }, async (request) => {
    const { numberId } = request.params as { numberId: string };
    await requireNumberAccess(db, request.authUser, numberId);
    const rows = await listCallsForNumber(db, numberId);
    return { calls: rows.map(serialize) };
  });

  app.get("/api/calls/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const row = await getCallOr404(db, id);
    await requireNumberAccess(db, request.authUser, row.numberId);
    return { call: serialize(row) };
  });
}
