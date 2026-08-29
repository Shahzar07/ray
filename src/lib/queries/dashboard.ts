import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { startOfDay, endOfDay, subDays, addDays } from "date-fns";
import { db } from "@/lib/db/client";
import { activities, dailyStats, importBatches, leads, memberships, users } from "@/lib/db/schema";
import { visibleUserIds } from "@/lib/auth/visibility";
import { CLOSED_STATUSES, PIPELINE_ORDER } from "@/lib/domain/constants";

const LEAD_CARD = {
  id: leads.id,
  fullName: leads.fullName,
  company: leads.company,
  phonePrimary: leads.phonePrimary,
  status: leads.status,
  interestLevel: leads.interestLevel,
  timezone: leads.timezone,
  nextFollowUpAt: leads.nextFollowUpAt,
  followUpChannel: leads.followUpChannel,
  followUpNote: leads.followUpNote,
  trialStatus: leads.trialStatus,
  trialStartedAt: leads.trialStartedAt,
  trialEndsAt: leads.trialEndsAt,
  attemptsCount: leads.attemptsCount,
  score: leads.score,
  assignedTo: leads.assignedTo,
  assigneeName: users.name,
};

export type TodayCard = {
  id: string;
  fullName: string;
  company: string | null;
  phonePrimary: string;
  status: (typeof leads.status.enumValues)[number];
  interestLevel: (typeof leads.interestLevel.enumValues)[number] | null;
  timezone: string | null;
  nextFollowUpAt: Date | null;
  followUpChannel: string | null;
  followUpNote: string | null;
  trialStatus: (typeof leads.trialStatus.enumValues)[number];
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  attemptsCount: number;
  score: number;
  assignedTo: string | null;
  assigneeName: string | null;
};

/**
 * /today — the login landing page. One round-trip per section, each already
 * ordered the way the caller should work it.
 */
export async function getTodayBoard(userId: string, teamId: string) {
  const now = new Date();
  const mine = and(eq(leads.teamId, teamId), eq(leads.assignedTo, userId), eq(leads.isArchived, false));
  const open = notInArray(leads.status, CLOSED_STATUSES);

  const base = () => db.select(LEAD_CARD).from(leads).leftJoin(users, eq(users.id, leads.assignedTo));

  const [overdue, dueToday, trialsEnding, trialsPending, freshLeads] = await Promise.all([
    base()
      .where(and(mine, open, lte(leads.nextFollowUpAt, startOfDay(now))))
      .orderBy(asc(leads.nextFollowUpAt))
      .limit(50),
    base()
      .where(and(mine, open, gte(leads.nextFollowUpAt, startOfDay(now)), lte(leads.nextFollowUpAt, endOfDay(now))))
      .orderBy(asc(leads.nextFollowUpAt))
      .limit(50),
    base()
      .where(and(mine, eq(leads.trialStatus, "active"), lte(leads.trialEndsAt, addDays(now, 2))))
      .orderBy(asc(leads.trialEndsAt))
      .limit(25),
    base()
      .where(and(mine, eq(leads.trialStatus, "ended_pending")))
      .orderBy(asc(leads.trialEndsAt))
      .limit(25),
    base()
      .where(and(mine, eq(leads.status, "new"), eq(leads.attemptsCount, 0)))
      .orderBy(desc(leads.score))
      .limit(25),
  ]);

  return {
    overdue: overdue as TodayCard[],
    dueToday: dueToday as TodayCard[],
    trialsEnding: trialsEnding as TodayCard[],
    trialsPending: trialsPending as TodayCard[],
    freshLeads: freshLeads as TodayCard[],
  };
}

/** Live counters for the progress rings — computed from today's activities. */
export async function getTodayProgress(userId: string) {
  const from = startOfDay(new Date());
  const [row] = await db
    .select({
      dials: sql<number>`count(*) filter (where ${activities.type} = 'call')::int`,
      answered: sql<number>`count(*) filter (where ${activities.callOutcome} = 'answered')::int`,
      notes: sql<number>`count(*) filter (where ${activities.type} = 'note')::int`,
      interested: sql<number>`count(*) filter (where ${activities.type} = 'status_change' and ${activities.toValue}->>'status' = 'interested')::int`,
      demos: sql<number>`count(*) filter (where ${activities.type} = 'trial_event' and ${activities.toValue}->>'trialStatus' = 'scheduled')::int`,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), gte(activities.createdAt, from)));

  return row ?? { dials: 0, answered: 0, notes: 0, interested: 0, demos: 0 };
}

/** Last 14 days of this user's dials — feeds the sparkline on /today. */
export async function getDialTrend(userId: string, days = 14): Promise<number[]> {
  const from = startOfDay(subDays(new Date(), days - 1));
  const rows = await db
    .select({
      day: sql<string>`to_char(${activities.createdAt}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.type, "call"), gte(activities.createdAt, from)))
    .groupBy(sql`1`);

  const map = new Map(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(new Date(), days - 1 - i);
    return map.get(d.toISOString().slice(0, 10)) ?? 0;
  });
}

/* ------------------------------- Trials ------------------------------ */

export async function getTrialBoard(userId: string, teamId: string) {
  const allowed = await visibleUserIds(userId, teamId);
  if (allowed.length === 0) {
    return { scheduled: [], active: [], pending: [], converted: [], churned: [] };
  }

  const scope = and(
    eq(leads.teamId, teamId),
    eq(leads.isArchived, false),
    or(inArray(leads.assignedTo, allowed), isNull(leads.assignedTo)),
  );

  const rows = (await db
    .select(LEAD_CARD)
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(and(scope, sql`${leads.trialStatus} <> 'none'`))
    .orderBy(asc(leads.trialEndsAt))
    .limit(400)) as TodayCard[];

  return {
    scheduled: rows.filter((r) => r.trialStatus === "scheduled"),
    active: rows.filter((r) => r.trialStatus === "active"),
    pending: rows.filter((r) => r.trialStatus === "ended_pending"),
    converted: rows.filter((r) => r.trialStatus === "converted"),
    churned: rows.filter((r) => r.trialStatus === "churned"),
  };
}

/** Conversion rate per caller, restricted to trials that actually finished. */
export async function getTrialConversionByUser(teamId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      started: sql<number>`count(*) filter (where ${leads.trialStartedAt} is not null)::int`,
      converted: sql<number>`count(*) filter (where ${leads.trialStatus} = 'converted')::int`,
      churned: sql<number>`count(*) filter (where ${leads.trialStatus} = 'churned')::int`,
    })
    .from(leads)
    .innerJoin(users, eq(users.id, leads.assignedTo))
    .where(and(eq(leads.teamId, teamId), sql`${leads.trialStatus} <> 'none'`))
    .groupBy(users.id, users.name, users.avatarUrl)
    .orderBy(desc(sql`count(*) filter (where ${leads.trialStatus} = 'converted')`));
}

/* ------------------------------ Analytics ---------------------------- */

export type FunnelStep = { key: string; label: string; value: number; rate: number | null };

export async function getFunnel(userId: string, teamId: string): Promise<FunnelStep[]> {
  const allowed = await visibleUserIds(userId, teamId);
  if (allowed.length === 0) return [];

  const scope = and(
    eq(leads.teamId, teamId),
    eq(leads.isArchived, false),
    or(inArray(leads.assignedTo, allowed), isNull(leads.assignedTo)),
  );

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      attempted: sql<number>`count(*) filter (where ${leads.attemptsCount} > 0)::int`,
      connected: sql<number>`count(*) filter (where ${leads.connectsCount} > 0)::int`,
      interested: sql<number>`count(*) filter (where ${leads.interestLevel} is not null and ${leads.interestLevel} <> 'cold')::int`,
      demo: sql<number>`count(*) filter (where ${leads.demoScheduledAt} is not null)::int`,
      trial: sql<number>`count(*) filter (where ${leads.trialStartedAt} is not null)::int`,
      converted: sql<number>`count(*) filter (where ${leads.convertedAt} is not null)::int`,
    })
    .from(leads)
    .where(scope);

  const steps: Array<[string, string, number]> = [
    ["total", "Leads", row?.total ?? 0],
    ["attempted", "Attempted", row?.attempted ?? 0],
    ["connected", "Connected", row?.connected ?? 0],
    ["interested", "Interested", row?.interested ?? 0],
    ["demo", "Demo scheduled", row?.demo ?? 0],
    ["trial", "Trial active", row?.trial ?? 0],
    ["converted", "Converted", row?.converted ?? 0],
  ];

  return steps.map(([key, label, value], i) => {
    const prev = i === 0 ? null : steps[i - 1]![2];
    return { key, label, value, rate: prev ? (value / prev) * 100 : null };
  });
}

/** Daily dials/connects per member, read from the pre-aggregated table. */
export async function getDailySeries(teamId: string, days = 30) {
  const from = subDays(new Date(), days).toISOString().slice(0, 10);
  return db
    .select({
      date: dailyStats.date,
      userId: dailyStats.userId,
      name: users.name,
      dials: dailyStats.dials,
      answered: dailyStats.answered,
      interested: dailyStats.interested,
      converted: dailyStats.converted,
    })
    .from(dailyStats)
    .innerJoin(users, eq(users.id, dailyStats.userId))
    .where(and(eq(dailyStats.teamId, teamId), gte(dailyStats.date, from)))
    .orderBy(asc(dailyStats.date));
}

/** Connect rate by hour of day — bar chart ordered by rate, not volume. */
export async function getBestCallingHours(teamId: string, days = 60) {
  const from = subDays(new Date(), days);
  return db
    .select({
      hour: sql<number>`extract(hour from ${activities.createdAt})::int`,
      dials: sql<number>`count(*)::int`,
      answered: sql<number>`count(*) filter (where ${activities.callOutcome} = 'answered')::int`,
    })
    .from(activities)
    .innerJoin(leads, eq(leads.id, activities.leadId))
    .where(and(eq(leads.teamId, teamId), eq(activities.type, "call"), gte(activities.createdAt, from)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

/** Which scraped sheets actually convert — tells the team where to scrape. */
export async function getBatchQuality(teamId: string) {
  return db
    .select({
      batchId: leads.sourceBatchId,
      filename: importBatches.filename,
      total: sql<number>`count(*)::int`,
      connected: sql<number>`count(*) filter (where ${leads.connectsCount} > 0)::int`,
      interested: sql<number>`count(*) filter (where ${leads.interestLevel} in ('hot','warm'))::int`,
      converted: sql<number>`count(*) filter (where ${leads.convertedAt} is not null)::int`,
      wrongNumber: sql<number>`count(*) filter (where ${leads.status} = 'wrong_number')::int`,
    })
    .from(leads)
    .innerJoin(importBatches, eq(importBatches.id, leads.sourceBatchId))
    .where(eq(leads.teamId, teamId))
    .groupBy(leads.sourceBatchId, importBatches.filename)
    .orderBy(desc(sql`count(*)`))
    .limit(20);
}

/**
 * Demo-week conversion traced back to the sheet the lead came from. A batch
 * that produces trials but no conversions is a different problem from one
 * that never produces a trial at all, so both numbers are kept.
 */
export async function getTrialConversionByBatch(teamId: string) {
  return db
    .select({
      batchId: leads.sourceBatchId,
      filename: importBatches.filename,
      leadCount: sql<number>`count(*)::int`,
      started: sql<number>`count(*) filter (where ${leads.trialStartedAt} is not null)::int`,
      converted: sql<number>`count(*) filter (where ${leads.trialStatus} = 'converted')::int`,
    })
    .from(leads)
    .innerJoin(importBatches, eq(importBatches.id, leads.sourceBatchId))
    .where(eq(leads.teamId, teamId))
    .groupBy(leads.sourceBatchId, importBatches.filename)
    .having(sql`count(*) filter (where ${leads.trialStartedAt} is not null) > 0`)
    .orderBy(desc(sql`count(*) filter (where ${leads.trialStatus} = 'converted')`))
    .limit(12);
}

export async function getLostReasons(teamId: string) {
  return db
    .select({ reason: leads.lostReason, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.teamId, teamId), sql`${leads.lostReason} is not null`))
    .groupBy(leads.lostReason)
    .orderBy(desc(sql`count(*)`));
}

export type LeaderboardRow = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  dials: number;
  answered: number;
  interested: number;
  demosScheduled: number;
  trialsStarted: number;
  converted: number;
};

/** Visible to the whole team by design — the brief is explicit about that. */
export async function getLeaderboard(teamId: string, from: Date, to: Date): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: memberships.role,
      dials: sql<number>`coalesce(sum(${dailyStats.dials}), 0)::int`,
      answered: sql<number>`coalesce(sum(${dailyStats.answered}), 0)::int`,
      interested: sql<number>`coalesce(sum(${dailyStats.interested}), 0)::int`,
      demosScheduled: sql<number>`coalesce(sum(${dailyStats.demosScheduled}), 0)::int`,
      trialsStarted: sql<number>`coalesce(sum(${dailyStats.trialsStarted}), 0)::int`,
      converted: sql<number>`coalesce(sum(${dailyStats.converted}), 0)::int`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(
      dailyStats,
      and(
        eq(dailyStats.userId, users.id),
        gte(dailyStats.date, from.toISOString().slice(0, 10)),
        lte(dailyStats.date, to.toISOString().slice(0, 10)),
      ),
    )
    .where(eq(memberships.teamId, teamId))
    .groupBy(users.id, users.name, users.avatarUrl, memberships.role);

  return rows.sort(
    (a, b) => b.converted - a.converted || b.interested - a.interested || b.dials - a.dials,
  );
}

/* -------------------------------- Team ------------------------------- */

export async function getTeamPerformance(teamId: string, from: Date, to: Date) {
  const stats = await getLeaderboard(teamId, from, to);

  const extra = await db
    .select({
      userId: leads.assignedTo,
      openLeads: sql<number>`count(*) filter (where ${leads.status} not in ('converted','lost','not_interested','wrong_number','do_not_call'))::int`,
      overdue: sql<number>`count(*) filter (where ${leads.nextFollowUpAt} < now() and ${leads.status} not in ('converted','lost','not_interested','wrong_number','do_not_call'))::int`,
      attempts: sql<number>`coalesce(sum(${leads.attemptsCount}), 0)::int`,
      connects: sql<number>`coalesce(sum(${leads.connectsCount}), 0)::int`,
    })
    .from(leads)
    .where(and(eq(leads.teamId, teamId), eq(leads.isArchived, false)))
    .groupBy(leads.assignedTo);

  const lastActive = await db
    .select({ userId: activities.userId, at: sql<Date>`max(${activities.createdAt})` })
    .from(activities)
    .innerJoin(leads, eq(leads.id, activities.leadId))
    .where(eq(leads.teamId, teamId))
    .groupBy(activities.userId);

  const extraMap = new Map(extra.map((e) => [e.userId, e]));
  const activeMap = new Map(lastActive.map((e) => [e.userId, e.at]));

  return stats.map((s) => {
    const e = extraMap.get(s.userId);
    return {
      ...s,
      openLeads: e?.openLeads ?? 0,
      overdue: e?.overdue ?? 0,
      attemptsToConnect: e && e.connects > 0 ? e.attempts / e.connects : null,
      lastActiveAt: activeMap.get(s.userId) ?? null,
    };
  });
}

/** Hour × weekday heatmap: when the team calls vs. when connects land. */
export async function getActivityHeatmap(teamId: string, days = 60) {
  const from = subDays(new Date(), days);
  return db
    .select({
      weekday: sql<number>`extract(dow from ${activities.createdAt})::int`,
      hour: sql<number>`extract(hour from ${activities.createdAt})::int`,
      dials: sql<number>`count(*)::int`,
      answered: sql<number>`count(*) filter (where ${activities.callOutcome} = 'answered')::int`,
    })
    .from(activities)
    .innerJoin(leads, eq(leads.id, activities.leadId))
    .where(and(eq(leads.teamId, teamId), eq(activities.type, "call"), gte(activities.createdAt, from)))
    .groupBy(sql`1`, sql`2`);
}

export async function getPipelineCounts(userId: string, teamId: string) {
  const allowed = await visibleUserIds(userId, teamId);
  if (allowed.length === 0) return PIPELINE_ORDER.map((s) => ({ status: s, n: 0 }));

  const rows = await db
    .select({ status: leads.status, n: count() })
    .from(leads)
    .where(
      and(
        eq(leads.teamId, teamId),
        eq(leads.isArchived, false),
        or(inArray(leads.assignedTo, allowed), isNull(leads.assignedTo)),
      ),
    )
    .groupBy(leads.status);

  const map = new Map(rows.map((r) => [r.status, r.n]));
  return PIPELINE_ORDER.map((s) => ({ status: s, n: map.get(s) ?? 0 }));
}
