import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { hashPassword } from "../auth/service.js";

export async function listUsers(db: Database) {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isSuperAdmin: users.isSuperAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt);
}

export async function createUser(
  db: Database,
  input: { email: string; name: string; password: string; isSuperAdmin?: boolean },
) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1);
  if (existing.length > 0) throw new ConflictError("A user with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
      isSuperAdmin: input.isSuperAdmin ?? false,
    })
    .returning({ id: users.id, email: users.email, name: users.name, isSuperAdmin: users.isSuperAdmin });
  return row;
}

export async function updateUser(
  db: Database,
  userId: string,
  input: { name?: string; password?: string; isSuperAdmin?: boolean },
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.isSuperAdmin !== undefined) patch.isSuperAdmin = input.isSuperAdmin;
  if (input.password !== undefined) patch.passwordHash = await hashPassword(input.password);

  const [row] = await db.update(users).set(patch).where(eq(users.id, userId)).returning({
    id: users.id,
    email: users.email,
    name: users.name,
    isSuperAdmin: users.isSuperAdmin,
  });
  if (!row) throw new NotFoundError("User not found");
  return row;
}

export async function deleteUser(db: Database, userId: string): Promise<void> {
  const result = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  if (result.length === 0) throw new NotFoundError("User not found");
}
