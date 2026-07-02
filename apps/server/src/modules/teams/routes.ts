import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TEAM_ROLES } from "@whatsapp-dashboard/shared";
import { db } from "../../db/client.js";
import { requireSuperAdmin, requireTeamRole, getAccessibleTeamIds } from "../../lib/rbac.js";
import { ValidationError } from "../../lib/errors.js";
import { writeAuditLog } from "../audit/service.js";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  listTeamMembers,
  listTeams,
  removeTeamMember,
  renameTeam,
} from "./service.js";

const createTeamSchema = z.object({ name: z.string().min(1) });
const addMemberSchema = z.object({ userId: z.string().uuid(), role: z.enum(TEAM_ROLES) });

export default async function teamsRoutes(app: FastifyInstance) {
  app.get("/api/teams", { preHandler: app.authenticate }, async (request) => {
    const accessibleIds = new Set(await getAccessibleTeamIds(db, request.authUser));
    const all = await listTeams(db);
    return { teams: request.authUser.isSuperAdmin ? all : all.filter((t) => accessibleIds.has(t.id)) };
  });

  app.post("/api/teams", { preHandler: app.authenticate }, async (request, reply) => {
    requireSuperAdmin(request.authUser);
    const body = createTeamSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);
    const team = await createTeam(db, body.data.name);
    await writeAuditLog(db, {
      userId: request.authUser.id,
      action: "team.create",
      resourceType: "team",
      resourceId: team.id,
      ipAddress: request.ip,
    });
    reply.status(201);
    return { team };
  });

  app.patch("/api/teams/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    await requireTeamRole(db, request.authUser, id, ["team_admin"]);
    const body = createTeamSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);
    const team = await renameTeam(db, id, body.data.name);
    return { team };
  });

  app.delete("/api/teams/:id", { preHandler: app.authenticate }, async (request, reply) => {
    requireSuperAdmin(request.authUser);
    const { id } = request.params as { id: string };
    await deleteTeam(db, id);
    reply.status(204);
    return null;
  });

  app.get("/api/teams/:id/members", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    await requireTeamRole(db, request.authUser, id, ["team_admin", "agent", "viewer"]);
    return { members: await listTeamMembers(db, id) };
  });

  app.post("/api/teams/:id/members", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    await requireTeamRole(db, request.authUser, id, ["team_admin"]);
    const body = addMemberSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);
    const member = await addTeamMember(db, id, body.data.userId, body.data.role);
    await writeAuditLog(db, {
      userId: request.authUser.id,
      action: "team.member.add",
      resourceType: "team",
      resourceId: id,
      metadata: { targetUserId: body.data.userId, role: body.data.role },
      ipAddress: request.ip,
    });
    return { member };
  });

  app.delete("/api/teams/:id/members/:userId", { preHandler: app.authenticate }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    await requireTeamRole(db, request.authUser, id, ["team_admin"]);
    await removeTeamMember(db, id, userId);
    reply.status(204);
    return null;
  });
}
