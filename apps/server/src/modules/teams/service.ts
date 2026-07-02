import { and, eq } from "drizzle-orm";
import type { TeamRole } from "@whatsapp-dashboard/shared";
import type { Database } from "../../db/client.js";
import { teamMembers, teams, users } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";

export async function listTeams(db: Database) {
  return db.select().from(teams).orderBy(teams.name);
}

export async function createTeam(db: Database, name: string) {
  const [row] = await db.insert(teams).values({ name }).returning();
  return row;
}

export async function renameTeam(db: Database, teamId: string, name: string) {
  const [row] = await db.update(teams).set({ name }).where(eq(teams.id, teamId)).returning();
  if (!row) throw new NotFoundError("Team not found");
  return row;
}

export async function deleteTeam(db: Database, teamId: string): Promise<void> {
  const result = await db.delete(teams).where(eq(teams.id, teamId)).returning({ id: teams.id });
  if (result.length === 0) throw new NotFoundError("Team not found");
}

export async function listTeamMembers(db: Database, teamId: string) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
}

export async function addTeamMember(db: Database, teamId: string, userId: string, role: TeamRole) {
  const [row] = await db
    .insert(teamMembers)
    .values({ teamId, userId, role })
    .onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { role } })
    .returning();
  return row;
}

export async function removeTeamMember(db: Database, teamId: string, userId: string): Promise<void> {
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
}
