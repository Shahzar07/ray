import "server-only";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  activities,
  customFieldDefs,
  doNotCall,
  invites,
  leadVisibilityLinks,
  leads,
  memberships,
  teams,
  users,
  type Role,
} from "@/lib/db/schema";

export type RosterMember = {
  userId: string;
  membershipId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: Role;
  isActive: boolean;
  dailyDialTarget: number;
  dailyConnectTarget: number;
  lastSeenAt: Date | null;
  joinedAt: Date;
  leadCount: number;
};

export async function getRoster(teamId: string): Promise<RosterMember[]> {
  const rows = await db
    .select({
      userId: users.id,
      membershipId: memberships.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: memberships.role,
      isActive: users.isActive,
      dailyDialTarget: memberships.dailyDialTarget,
      dailyConnectTarget: memberships.dailyConnectTarget,
      lastSeenAt: users.lastSeenAt,
      joinedAt: memberships.joinedAt,
      leadCount: sql<number>`(
        select count(*)::int from ${leads}
        where ${leads.assignedTo} = ${users.id} and ${leads.isArchived} = false
      )`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, teamId))
    .orderBy(asc(memberships.joinedAt));

  return rows;
}

export async function getPendingInvites(teamId: string) {
  return db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      token: invites.token,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(and(eq(invites.teamId, teamId), sql`${invites.acceptedAt} is null`))
    .orderBy(desc(invites.createdAt));
}

/**
 * Every directional grant in the team, as `viewer -> [targets]`. The matrix UI
 * reads this; owners and team leads are not in it because their reach comes
 * from their role, not from a row.
 */
export async function getVisibilityGrants(teamId: string): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ viewer: leadVisibilityLinks.viewerUserId, target: leadVisibilityLinks.targetUserId })
    .from(leadVisibilityLinks)
    .where(eq(leadVisibilityLinks.teamId, teamId));

  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.viewer] ??= []).push(row.target);
  return out;
}

export async function getTeamsInOrg(orgId: string) {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      createdAt: teams.createdAt,
      memberCount: sql<number>`(select count(*)::int from ${memberships} where ${memberships.teamId} = ${teams.id})`,
      leadCount: sql<number>`(select count(*)::int from ${leads} where ${leads.teamId} = ${teams.id})`,
    })
    .from(teams)
    .where(eq(teams.orgId, orgId))
    .orderBy(asc(teams.createdAt));
}

export async function getCustomFields(orgId: string) {
  return db
    .select()
    .from(customFieldDefs)
    .where(eq(customFieldDefs.orgId, orgId))
    .orderBy(asc(customFieldDefs.sortOrder), asc(customFieldDefs.label));
}

export type DncEntry = {
  id: string;
  phone: string;
  reason: string | null;
  addedBy: string | null;
  createdAt: Date;
  matchedLeads: number;
};

export async function getDncList(orgId: string, search?: string, limit = 200): Promise<DncEntry[]> {
  const clauses = [eq(doNotCall.orgId, orgId)];
  if (search?.trim()) {
    const term = `%${search.trim().replace(/[^\d+]/g, "")}%`;
    clauses.push(or(ilike(doNotCall.phone, term), ilike(doNotCall.reason, `%${search.trim()}%`))!);
  }

  return db
    .select({
      id: doNotCall.id,
      phone: doNotCall.phone,
      reason: doNotCall.reason,
      addedBy: users.name,
      createdAt: doNotCall.createdAt,
      matchedLeads: sql<number>`(
        select count(*)::int from ${leads}
        where ${leads.orgId} = ${orgId} and ${leads.phonePrimary} = ${doNotCall.phone}
      )`,
    })
    .from(doNotCall)
    .leftJoin(users, eq(users.id, doNotCall.addedBy))
    .where(and(...clauses))
    .orderBy(desc(doNotCall.createdAt))
    .limit(limit);
}

export async function getDncCount(orgId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(doNotCall).where(eq(doNotCall.orgId, orgId));
  return row?.n ?? 0;
}

/**
 * Neon's free tier is 0.5 GB and this team will not outgrow it for years, but
 * a number you can see beats an outage. Cheap enough to run on page load.
 */
export type StorageUsage = { bytes: number; limitBytes: number; leads: number; activities: number };

export async function getStorageUsage(): Promise<StorageUsage> {
  const [size] = await rawRows<{ bytes: string }>(
    sql`select pg_database_size(current_database())::text as bytes`,
  );
  const [leadRow] = await db.select({ n: count() }).from(leads);
  const [activityRow] = await db.select({ n: count() }).from(activities);

  return {
    bytes: Number(size?.bytes ?? 0),
    limitBytes: 512 * 1024 * 1024,
    leads: leadRow?.n ?? 0,
    activities: activityRow?.n ?? 0,
  };
}

/** node-postgres hands back a QueryResult; the Neon HTTP driver hands back rows. */
async function rawRows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  const result = await db.execute<T>(query);
  return (Array.isArray(result) ? result : result.rows) as T[];
}
