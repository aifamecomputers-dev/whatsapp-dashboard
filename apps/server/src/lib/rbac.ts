import { and, eq } from "drizzle-orm";
import type { TeamRole } from "@whatsapp-dashboard/shared";
import type { Database } from "../db/client.js";
import { numberTeamAccess, teamMembers, users } from "../db/schema.js";
import { ForbiddenError } from "./errors.js";

export interface AuthenticatedUser {
  id: string;
  isSuperAdmin: boolean;
}

/**
 * Single source of truth for "who can see number X". Used identically by REST
 * route guards and by the Socket.IO room-join logic on connect, so access
 * computed for the API can never drift from access computed for the realtime
 * layer.
 */
export async function getAccessibleNumberIds(db: Database, user: AuthenticatedUser): Promise<string[]> {
  if (user.isSuperAdmin) {
    const rows = await db.query.phoneNumbers.findMany({ columns: { id: true } });
    return rows.map((r) => r.id);
  }

  const rows = await db
    .select({ numberId: numberTeamAccess.numberId })
    .from(numberTeamAccess)
    .innerJoin(teamMembers, eq(teamMembers.teamId, numberTeamAccess.teamId))
    .where(eq(teamMembers.userId, user.id));

  return [...new Set(rows.map((r) => r.numberId))];
}

export async function getAccessibleTeamIds(db: Database, user: AuthenticatedUser): Promise<string[]> {
  if (user.isSuperAdmin) {
    const rows = await db.query.teams.findMany({ columns: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, user.id));
  return rows.map((r) => r.teamId);
}

export async function hasNumberAccess(db: Database, user: AuthenticatedUser, numberId: string): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const [row] = await db
    .select({ numberId: numberTeamAccess.numberId })
    .from(numberTeamAccess)
    .innerJoin(teamMembers, eq(teamMembers.teamId, numberTeamAccess.teamId))
    .where(and(eq(teamMembers.userId, user.id), eq(numberTeamAccess.numberId, numberId)))
    .limit(1);
  return Boolean(row);
}

/** Throws ForbiddenError (mapped to HTTP 403) if the user cannot access this number. */
export async function requireNumberAccess(db: Database, user: AuthenticatedUser, numberId: string): Promise<void> {
  const ok = await hasNumberAccess(db, user, numberId);
  if (!ok) throw new ForbiddenError("You do not have access to this phone number");
}

export async function getUserRoleInTeam(db: Database, userId: string, teamId: string): Promise<TeamRole | null> {
  const [row] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)))
    .limit(1);
  return row?.role ?? null;
}

/** Throws ForbiddenError unless the user is a super admin or holds one of `allowedRoles` in the team. */
export async function requireTeamRole(
  db: Database,
  user: AuthenticatedUser,
  teamId: string,
  allowedRoles: TeamRole[],
): Promise<void> {
  if (user.isSuperAdmin) return;
  const role = await getUserRoleInTeam(db, user.id, teamId);
  if (!role || !allowedRoles.includes(role)) {
    throw new ForbiddenError("You do not have the required role in this team");
  }
}

export function requireSuperAdmin(user: AuthenticatedUser): void {
  if (!user.isSuperAdmin) {
    throw new ForbiddenError("This action requires a super admin");
  }
}

/** Resolves which teams have visibility of a given number (used to tag call-log rows with a team). */
export async function getTeamsForNumber(db: Database, numberId: string): Promise<string[]> {
  const rows = await db
    .select({ teamId: numberTeamAccess.teamId })
    .from(numberTeamAccess)
    .where(eq(numberTeamAccess.numberId, numberId));
  return rows.map((r) => r.teamId);
}

export async function loadAuthenticatedUser(db: Database, userId: string): Promise<AuthenticatedUser | null> {
  const [row] = await db
    .select({ id: users.id, isSuperAdmin: users.isSuperAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}
