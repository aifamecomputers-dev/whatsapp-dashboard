import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { requireSuperAdmin } from "../../lib/rbac.js";
import { ValidationError, ForbiddenError } from "../../lib/errors.js";
import { writeAuditLog } from "../audit/service.js";
import { createUser, deleteUser, listUsers, updateUser } from "./service.js";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  isSuperAdmin: z.boolean().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  isSuperAdmin: z.boolean().optional(),
});

export default async function usersRoutes(app: FastifyInstance) {
  app.get("/api/users", { preHandler: app.authenticate }, async (request) => {
    requireSuperAdmin(request.authUser);
    return { users: await listUsers(db) };
  });

  app.post("/api/users", { preHandler: app.authenticate }, async (request, reply) => {
    requireSuperAdmin(request.authUser);
    const body = createUserSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);

    const user = await createUser(db, body.data);
    await writeAuditLog(db, {
      userId: request.authUser.id,
      action: "user.create",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: request.ip,
    });
    reply.status(201);
    return { user };
  });

  app.patch("/api/users/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const isSelf = request.authUser.id === id;
    if (!isSelf) requireSuperAdmin(request.authUser);

    const body = updateUserSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);

    // Non-admins editing themselves cannot grant themselves admin rights.
    if (isSelf && !request.authUser.isSuperAdmin && body.data.isSuperAdmin !== undefined) {
      throw new ForbiddenError("Cannot change your own admin status");
    }

    const user = await updateUser(db, id, body.data);
    await writeAuditLog(db, {
      userId: request.authUser.id,
      action: "user.update",
      resourceType: "user",
      resourceId: id,
      ipAddress: request.ip,
    });
    return { user };
  });

  app.delete("/api/users/:id", { preHandler: app.authenticate }, async (request, reply) => {
    requireSuperAdmin(request.authUser);
    const { id } = request.params as { id: string };
    await deleteUser(db, id);
    await writeAuditLog(db, {
      userId: request.authUser.id,
      action: "user.delete",
      resourceType: "user",
      resourceId: id,
      ipAddress: request.ip,
    });
    reply.status(204);
    return null;
  });
}
