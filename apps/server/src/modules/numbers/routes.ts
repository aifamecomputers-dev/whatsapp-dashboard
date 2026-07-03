import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { requireNumberAccess, requireSuperAdmin } from "../../lib/rbac.js";
import { ValidationError } from "../../lib/errors.js";
import { writeAuditLog } from "../audit/service.js";
import { createNumber, deleteNumber, listNumbers, updateNumber } from "./service.js";

const numberInputSchema = z.object({
  label: z.string().min(1),
  displayPhoneNumber: z.string().min(1),
  whatsappPhoneNumberId: z.string().optional(),
  whatsappWabaId: z.string().optional(),
  whatsappAccessToken: z.string().optional(),
  whatsappCallingEnabled: z.boolean().optional(),
  teamIds: z.array(z.string().uuid()).optional(),
});

const numberUpdateSchema = numberInputSchema.partial();

export default async function numbersRoutes(app: FastifyInstance) {
  app.get("/api/numbers", { preHandler: app.authenticate }, async (request) => {
    return { numbers: await listNumbers(db, request.authUser) };
  });

  // Creating/editing a number touches encrypted credentials — restricted to super admins,
  // who are the only role allowed to view/edit those secrets per the RBAC design.
  app.post("/api/numbers", { preHandler: app.authenticate }, async (request, reply) => {
    requireSuperAdmin(request.authUser);
    const body = numberInputSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);
    const number = await createNumber(db, body.data);
    await writeAuditLog(db, {
      userId: request.authUser.id,
      action: "number.create",
      resourceType: "phone_number",
      resourceId: number.id,
      ipAddress: request.ip,
    });
    reply.status(201);
    return { number };
  });

  app.patch("/api/numbers/:id", { preHandler: app.authenticate }, async (request) => {
    requireSuperAdmin(request.authUser);
    const { id } = request.params as { id: string };
    const body = numberUpdateSchema.safeParse(request.body);
    if (!body.success) throw new ValidationError(body.error.message);
    const number = await updateNumber(db, id, body.data);
    await writeAuditLog(db, {
      userId: request.authUser.id,
      action: "number.update",
      resourceType: "phone_number",
      resourceId: id,
      metadata: { touchedSecrets: Boolean(body.data.whatsappAccessToken) },
      ipAddress: request.ip,
    });
    return { number };
  });

  app.delete("/api/numbers/:id", { preHandler: app.authenticate }, async (request, reply) => {
    requireSuperAdmin(request.authUser);
    const { id } = request.params as { id: string };
    await deleteNumber(db, id);
    reply.status(204);
    return null;
  });

  app.get("/api/numbers/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    await requireNumberAccess(db, request.authUser, id);
    const numbers = await listNumbers(db, request.authUser);
    const number = numbers.find((n) => n.id === id);
    if (!number) throw new ValidationError("Number not found or not accessible");
    return { number };
  });
}
