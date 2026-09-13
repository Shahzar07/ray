import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memberships, teams, users, workSessions } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageTeam, visibleUserIds } from "@/lib/auth/visibility";
import { monthRange } from "@/lib/domain/attendance";

export async function getTeamAttendance(month: string, requestedTeam?: string) {
  const ctx = await requireSession();
  const teamId = requestedTeam || ctx.team.id;
  await assertCanManageTeam(ctx.user.id, teamId);
  const allowed = await visibleUserIds(ctx.user.id, teamId);
  const range = monthRange(month);
  const availableTeams =
    ctx.role === "owner"
      ? await db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(eq(teams.orgId, ctx.org.id))
          .orderBy(asc(teams.name))
      : ctx.teams.filter((t) => t.role !== "agent");
  const [members, sessions] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        timezone: users.timezone,
        isActive: users.isActive,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.teamId, teamId))
      .orderBy(asc(users.name)),
    db
      .select()
      .from(workSessions)
      .where(
        and(
          eq(workSessions.teamId, teamId),
          or(
            and(
              gte(workSessions.localDate, range.from),
              lte(workSessions.localDate, range.to),
            ),
            isNull(workSessions.endedAt),
            and(
              gte(workSessions.localDate, sql`(current_timestamp at time zone 'UTC')::date - 1`),
              lte(workSessions.localDate, sql`(current_timestamp at time zone 'UTC')::date + 1`),
            ),
          ),
        ),
      )
      .orderBy(desc(workSessions.startedAt)),
  ]);
  return {
    teamId,
    availableTeams,
    members: members.filter((m) => allowed.includes(m.id)),
    sessions,
    serverNow: new Date().toISOString(),
  };
}
