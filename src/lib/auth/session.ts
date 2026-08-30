import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memberships, organizations, teams, users, type Role } from "@/lib/db/schema";
import { auth } from "./index";
import { can, type Capability } from "@/lib/domain/roles";

export type SessionContext = {
  user: { id: string; name: string; email: string; timezone: string; avatarUrl: string | null };
  org: { id: string; name: string; timezone: string; callingWindowStart: number; callingWindowEnd: number };
  team: { id: string; name: string };
  role: Role;
  teams: Array<{ id: string; name: string; role: Role }>;
  dailyDialTarget: number;
  dailyConnectTarget: number;
};

/**
 * Resolves the signed-in user together with their active team, role and org.
 * Deduplicated per request by React `cache` so a page with ten server
 * components still issues one query.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) return null;

  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      role: memberships.role,
      dailyDialTarget: memberships.dailyDialTarget,
      dailyConnectTarget: memberships.dailyConnectTarget,
      orgId: organizations.id,
      orgName: organizations.name,
      orgTimezone: organizations.timezone,
      callingWindowStart: organizations.callingWindowStart,
      callingWindowEnd: organizations.callingWindowEnd,
    })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.joinedAt));

  const active = rows[0];
  if (!active) return null;

  return {
    user: {
      id: user.id,
      name: user.name ?? user.email,
      email: user.email,
      timezone: user.timezone,
      avatarUrl: user.avatarUrl,
    },
    org: {
      id: active.orgId,
      name: active.orgName,
      timezone: active.orgTimezone,
      callingWindowStart: active.callingWindowStart,
      callingWindowEnd: active.callingWindowEnd,
    },
    team: { id: active.teamId, name: active.teamName },
    role: active.role,
    teams: rows.map((r) => ({ id: r.teamId, name: r.teamName, role: r.role })),
    dailyDialTarget: active.dailyDialTarget,
    dailyConnectTarget: active.dailyConnectTarget,
  };
});

/** Use in every authenticated page and server action. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Gate a page on one capability, sending anyone without it back to /today.
 *
 * Was `requireTeamManager`, which stopped being an honest name once "manager"
 * became an actual role distinct from the check being made. Defaults to lead
 * management, which is what every caller meant by it before.
 */
export async function requireCapability(
  capability: Capability = "leads.manageAll",
): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!can(ctx.role, capability)) redirect("/today");
  return ctx;
}

export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return Boolean(row);
}

export async function teamMembers(teamId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: memberships.role,
      isActive: users.isActive,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.teamId, teamId), eq(users.isActive, true)))
    .orderBy(asc(users.name));
}
