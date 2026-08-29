import "server-only";
import { and, desc, eq, gte, inArray, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { startOfDay, endOfDay } from "date-fns";
import { db } from "@/lib/db/client";
import { activities, leads, users } from "@/lib/db/schema";
import { CLOSED_STATUSES } from "@/lib/domain/constants";
import { isInCallingWindow } from "@/lib/domain/dates";
import { REASON_ORDER, type QueueReason } from "@/lib/domain/queue";

import type { InterestLevel, LeadStatus, TrialStatus } from "@/lib/db/schema";

export { REASON_LABEL } from "@/lib/domain/queue";
export type { QueueReason } from "@/lib/domain/queue";

export type QueueLead = {
  id: string;
  fullName: string;
  company: string | null;
  jobTitle: string | null;
  phonePrimary: string;
  email: string | null;
  city: string | null;
  timezone: string | null;
  status: LeadStatus;
  interestLevel: InterestLevel | null;
  trialStatus: TrialStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  source: string;
  sourceNote: string | null;
  score: number;
  attemptsCount: number;
  connectsCount: number;
  lastAttemptedAt: string | null;
  nextFollowUpAt: string | null;
  followUpNote: string | null;
  tags: string[];
  reason: QueueReason;
  recent: Array<{ type: string; outcome: string | null; body: string | null; at: string; who: string | null }>;
  duplicate: { userName: string | null; at: string } | null;
};

/**
 * Call Mode's queue, in the order the sales motion actually wants:
 *   overdue follow-ups → due today → demo-week check-ins → hot never-attempted
 *   → new leads by score.
 * Anything outside the lead's own calling window is dropped, so nobody dials
 * a Karachi clinic at 3am their time.
 */
export async function buildCallQueue(
  userId: string,
  teamId: string,
  options: { window: [number, number]; limit?: number; only?: QueueReason; leadId?: string },
): Promise<QueueLead[]> {
  const now = new Date();

  const mine = and(
    eq(leads.teamId, teamId),
    eq(leads.assignedTo, userId),
    eq(leads.isArchived, false),
    notInArray(leads.status, CLOSED_STATUSES),
  );

  const candidates = or(
    lte(leads.nextFollowUpAt, endOfDay(now)),
    eq(leads.trialStatus, "active"),
    eq(leads.trialStatus, "ended_pending"),
    and(eq(leads.attemptsCount, 0), eq(leads.interestLevel, "hot")),
    eq(leads.status, "new"),
  );

  const rows = await db
    .select({
      id: leads.id,
      orgId: leads.orgId,
      fullName: leads.fullName,
      company: leads.company,
      jobTitle: leads.jobTitle,
      phonePrimary: leads.phonePrimary,
      email: leads.email,
      city: leads.city,
      timezone: leads.timezone,
      status: leads.status,
      interestLevel: leads.interestLevel,
      trialStatus: leads.trialStatus,
      trialStartedAt: leads.trialStartedAt,
      trialEndsAt: leads.trialEndsAt,
      source: leads.source,
      sourceNote: leads.sourceNote,
      score: leads.score,
      attemptsCount: leads.attemptsCount,
      connectsCount: leads.connectsCount,
      lastAttemptedAt: leads.lastAttemptedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      followUpNote: leads.followUpNote,
      tags: leads.tags,
    })
    .from(leads)
    .where(options.leadId ? and(eq(leads.id, options.leadId), eq(leads.teamId, teamId)) : and(mine, candidates))
    .orderBy(desc(leads.score))
    .limit(options.leadId ? 1 : 300);

  const ranked = rows
    .map((lead) => {
      let reason: QueueReason = "new";
      if (lead.nextFollowUpAt && lead.nextFollowUpAt < startOfDay(now)) reason = "overdue";
      else if (lead.nextFollowUpAt && lead.nextFollowUpAt <= endOfDay(now)) reason = "due_today";
      else if (lead.trialStatus === "active" || lead.trialStatus === "ended_pending") reason = "trial";
      else if (lead.interestLevel === "hot" && lead.attemptsCount === 0) reason = "hot";
      return { ...lead, reason };
    })
    // An explicitly requested lead always shows, window or not.
    .filter((lead) => Boolean(options.leadId) || isInCallingWindow(lead.timezone, options.window[0], options.window[1], now))
    .filter((lead) => !options.only || lead.reason === options.only)
    .sort(
      (a, b) =>
        REASON_ORDER[a.reason] - REASON_ORDER[b.reason] ||
        (a.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (b.nextFollowUpAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        b.score - a.score,
    )
    .slice(0, options.limit ?? 40);

  if (ranked.length === 0) return [];

  const ids = ranked.map((l) => l.id);
  const phones = ranked.map((l) => l.phonePrimary);
  const orgId = ranked[0]!.orgId;

  const [recent, dupes] = await Promise.all([
    db
      .select({
        leadId: activities.leadId,
        type: activities.type,
        outcome: activities.callOutcome,
        body: activities.body,
        at: activities.createdAt,
        who: users.name,
        rank: sql<number>`row_number() over (partition by ${activities.leadId} order by ${activities.createdAt} desc)`,
      })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.userId))
      .where(inArray(activities.leadId, ids))
      .orderBy(desc(activities.createdAt)),

    // Duplicate-contact warning: someone else dialled this number recently.
    db
      .select({ phone: leads.phonePrimary, userName: users.name, at: activities.createdAt })
      .from(activities)
      .innerJoin(leads, eq(leads.id, activities.leadId))
      .leftJoin(users, eq(users.id, activities.userId))
      .where(
        and(
          eq(leads.orgId, orgId),
          inArray(leads.phonePrimary, phones),
          eq(activities.type, "call"),
          ne(activities.userId, userId),
          gte(activities.createdAt, new Date(now.getTime() - 30 * 86_400_000)),
        ),
      )
      .orderBy(desc(activities.createdAt)),
  ]);

  const recentByLead = new Map<string, QueueLead["recent"]>();
  for (const row of recent) {
    if (Number(row.rank) > 3) continue;
    const list = recentByLead.get(row.leadId) ?? [];
    list.push({ type: row.type, outcome: row.outcome, body: row.body, at: row.at.toISOString(), who: row.who });
    recentByLead.set(row.leadId, list);
  }

  const dupeByPhone = new Map<string, { userName: string | null; at: string }>();
  for (const row of dupes) {
    if (!dupeByPhone.has(row.phone)) dupeByPhone.set(row.phone, { userName: row.userName, at: row.at.toISOString() });
  }

  return ranked.map((lead) => ({
    id: lead.id,
    fullName: lead.fullName,
    company: lead.company,
    jobTitle: lead.jobTitle,
    phonePrimary: lead.phonePrimary,
    email: lead.email,
    city: lead.city,
    timezone: lead.timezone,
    status: lead.status,
    interestLevel: lead.interestLevel,
    trialStatus: lead.trialStatus,
    trialStartedAt: lead.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: lead.trialEndsAt?.toISOString() ?? null,
    source: lead.source,
    sourceNote: lead.sourceNote,
    score: lead.score,
    attemptsCount: lead.attemptsCount,
    connectsCount: lead.connectsCount,
    lastAttemptedAt: lead.lastAttemptedAt?.toISOString() ?? null,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    followUpNote: lead.followUpNote,
    tags: lead.tags,
    reason: lead.reason,
    recent: recentByLead.get(lead.id) ?? [],
    duplicate: dupeByPhone.get(lead.phonePrimary) ?? null,
  }));
}
