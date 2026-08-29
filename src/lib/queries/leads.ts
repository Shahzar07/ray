import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  activities,
  importBatches,
  leads,
  users,
  type InterestLevel,
  type LeadStatus,
  type TrialStatus,
} from "@/lib/db/schema";
import { visibleUserIds } from "@/lib/auth/visibility";
import { CLOSED_STATUSES } from "@/lib/domain/constants";
import type { PresetKey } from "@/lib/domain/views";

export { PRESETS } from "@/lib/domain/views";
export type { PresetKey } from "@/lib/domain/views";

export type LeadFilters = {
  search?: string;
  status?: LeadStatus[];
  interest?: InterestLevel[];
  assignee?: string[];
  source?: string[];
  tags?: string[];
  trialStatus?: TrialStatus[];
  batchId?: string;
  followUpFrom?: Date;
  followUpTo?: Date;
  /** Built-in saved views. */
  preset?: PresetKey;
  includeArchived?: boolean;
};

export type LeadRow = {
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
  source: string;
  tags: string[];
  score: number;
  attemptsCount: number;
  connectsCount: number;
  lastAttemptedAt: Date | null;
  nextFollowUpAt: Date | null;
  followUpChannel: string | null;
  trialStatus: TrialStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  convertedAt: Date | null;
  assignedTo: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  batchName: string | null;
  updatedAt: Date;
  createdAt: Date;
};

const SELECTION = {
  id: leads.id,
  fullName: leads.fullName,
  company: leads.company,
  jobTitle: leads.jobTitle,
  phonePrimary: leads.phonePrimary,
  email: leads.email,
  city: leads.city,
  timezone: leads.timezone,
  status: leads.status,
  interestLevel: leads.interestLevel,
  source: leads.source,
  tags: leads.tags,
  score: leads.score,
  attemptsCount: leads.attemptsCount,
  connectsCount: leads.connectsCount,
  lastAttemptedAt: leads.lastAttemptedAt,
  nextFollowUpAt: leads.nextFollowUpAt,
  followUpChannel: leads.followUpChannel,
  trialStatus: leads.trialStatus,
  trialStartedAt: leads.trialStartedAt,
  trialEndsAt: leads.trialEndsAt,
  convertedAt: leads.convertedAt,
  assignedTo: leads.assignedTo,
  assigneeName: users.name,
  assigneeAvatar: users.avatarUrl,
  batchName: importBatches.filename,
  updatedAt: leads.updatedAt,
  createdAt: leads.createdAt,
};

/**
 * The one entry point for reading leads. Callers pass a userId and a teamId;
 * the visibility layer decides whose rows come back. There is no bypass.
 */
export async function listLeads(
  userId: string,
  teamId: string,
  filters: LeadFilters = {},
  opts: { limit?: number; offset?: number; sort?: string; dir?: "asc" | "desc" } = {},
): Promise<{ rows: LeadRow[]; total: number }> {
  const allowed = await visibleUserIds(userId, teamId);
  if (allowed.length === 0) return { rows: [], total: 0 };

  const where = buildWhere(teamId, allowed, filters);
  const orderBy = buildOrder(opts.sort, opts.dir);

  const rows = await db
    .select(SELECTION)
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .leftJoin(importBatches, eq(importBatches.id, leads.sourceBatchId))
    .where(where)
    .orderBy(...orderBy)
    .limit(opts.limit ?? 500)
    .offset(opts.offset ?? 0);

  const [totals] = await db.select({ n: count() }).from(leads).where(where);

  return { rows: rows as LeadRow[], total: totals?.n ?? 0 };
}

/** Counts per status for the kanban board and the filter bar chips. */
export async function leadStatusCounts(userId: string, teamId: string, filters: LeadFilters = {}) {
  const allowed = await visibleUserIds(userId, teamId);
  if (allowed.length === 0) return {} as Record<LeadStatus, number>;

  const rows = await db
    .select({ status: leads.status, n: count() })
    .from(leads)
    .where(buildWhere(teamId, allowed, { ...filters, status: undefined }))
    .groupBy(leads.status);

  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<LeadStatus, number>;
}

export async function getLeadDetail(userId: string, leadId: string) {
  const [lead] = await db
    .select({
      ...SELECTION,
      teamId: leads.teamId,
      orgId: leads.orgId,
      phoneAlt: leads.phoneAlt,
      website: leads.website,
      country: leads.country,
      sourceNote: leads.sourceNote,
      lostReason: leads.lostReason,
      demoScheduledAt: leads.demoScheduledAt,
      followUpNote: leads.followUpNote,
      followUpCount: leads.followUpCount,
      lastConnectedAt: leads.lastConnectedAt,
      customFields: leads.customFields,
      isArchived: leads.isArchived,
      sourceBatchId: leads.sourceBatchId,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .leftJoin(importBatches, eq(importBatches.id, leads.sourceBatchId))
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!lead) return null;

  const allowed = await visibleUserIds(userId, lead.teamId);
  const visible = lead.assignedTo === null || allowed.includes(lead.assignedTo);
  if (!visible) return null;

  return lead;
}

export async function getLeadTimeline(leadId: string, limit = 60) {
  return db
    .select({
      id: activities.id,
      type: activities.type,
      callOutcome: activities.callOutcome,
      durationSeconds: activities.durationSeconds,
      body: activities.body,
      fromValue: activities.fromValue,
      toValue: activities.toValue,
      aiGenerated: activities.aiGenerated,
      createdAt: activities.createdAt,
      userId: activities.userId,
      userName: users.name,
      userAvatar: users.avatarUrl,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.userId))
    .where(eq(activities.leadId, leadId))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}

/**
 * Duplicate-contact warning: has anyone else logged a call to this number
 * in the last 30 days? Org-wide, so two agents never double-dial a prospect.
 */
export async function recentContactByOthers(orgId: string, phone: string, excludeLeadId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      leadId: leads.id,
      userName: users.name,
      at: activities.createdAt,
      outcome: activities.callOutcome,
    })
    .from(activities)
    .innerJoin(leads, eq(leads.id, activities.leadId))
    .leftJoin(users, eq(users.id, activities.userId))
    .where(
      and(
        eq(leads.orgId, orgId),
        eq(leads.phonePrimary, phone),
        ne(leads.id, excludeLeadId),
        eq(activities.type, "call"),
        gte(activities.createdAt, since),
      ),
    )
    .orderBy(desc(activities.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function distinctTags(teamId: string): Promise<string[]> {
  const rows = await db
    .select({ tag: sql<string>`unnest(${leads.tags})` })
    .from(leads)
    .where(eq(leads.teamId, teamId))
    .groupBy(sql`1`)
    .orderBy(sql`1`)
    .limit(80);
  return rows.map((r) => r.tag).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Predicate construction — one place, reused by every lead read.      */
/* ------------------------------------------------------------------ */

export function buildWhere(teamId: string, allowedUserIds: string[], f: LeadFilters): SQL {
  const now = new Date();
  const clauses: (SQL | undefined)[] = [
    eq(leads.teamId, teamId),
    or(inArray(leads.assignedTo, allowedUserIds), isNull(leads.assignedTo)),
  ];

  if (!f.includeArchived) clauses.push(eq(leads.isArchived, false));

  if (f.search?.trim()) {
    const q = `%${f.search.trim()}%`;
    clauses.push(
      or(
        ilike(leads.fullName, q),
        ilike(leads.company, q),
        ilike(leads.phonePrimary, q),
        ilike(leads.email, q),
      ),
    );
  }

  if (f.status?.length) clauses.push(inArray(leads.status, f.status));
  if (f.interest?.length) clauses.push(inArray(leads.interestLevel, f.interest));
  if (f.trialStatus?.length) clauses.push(inArray(leads.trialStatus, f.trialStatus));
  if (f.batchId) clauses.push(eq(leads.sourceBatchId, f.batchId));
  if (f.source?.length) {
    clauses.push(inArray(leads.source, f.source as (typeof leads.source.enumValues)[number][]));
  }
  if (f.assignee?.length) {
    const withUnassigned = f.assignee.includes("unassigned");
    const ids = f.assignee.filter((a) => a !== "unassigned");
    clauses.push(
      withUnassigned
        ? or(ids.length ? inArray(leads.assignedTo, ids) : undefined, isNull(leads.assignedTo))
        : inArray(leads.assignedTo, ids),
    );
  }
  if (f.tags?.length) clauses.push(sql`${leads.tags} && ${f.tags}::text[]`);
  if (f.followUpFrom) clauses.push(gte(leads.nextFollowUpAt, f.followUpFrom));
  if (f.followUpTo) clauses.push(lte(leads.nextFollowUpAt, f.followUpTo));

  switch (f.preset) {
    case "overdue":
      clauses.push(lte(leads.nextFollowUpAt, now), notInArray(leads.status, CLOSED_STATUSES));
      break;
    case "due_today": {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      clauses.push(gte(leads.nextFollowUpAt, now), lte(leads.nextFollowUpAt, end));
      break;
    }
    case "hot":
      clauses.push(eq(leads.interestLevel, "hot"), notInArray(leads.status, CLOSED_STATUSES));
      break;
    case "trials_ending": {
      const in48 = new Date(now.getTime() + 48 * 3600_000);
      clauses.push(eq(leads.trialStatus, "active"), lte(leads.trialEndsAt, in48));
      break;
    }
    case "never_attempted":
      clauses.push(eq(leads.attemptsCount, 0));
      break;
    case "no_answer_3":
      clauses.push(gte(leads.attemptsCount, 3), eq(leads.connectsCount, 0));
      break;
    case "unassigned":
      clauses.push(isNull(leads.assignedTo));
      break;
    default:
      break;
  }

  return and(...clauses.filter(Boolean)) as SQL;
}

const SORTABLE = {
  fullName: leads.fullName,
  company: leads.company,
  status: leads.status,
  interestLevel: leads.interestLevel,
  score: leads.score,
  attemptsCount: leads.attemptsCount,
  nextFollowUpAt: leads.nextFollowUpAt,
  lastAttemptedAt: leads.lastAttemptedAt,
  trialEndsAt: leads.trialEndsAt,
  updatedAt: leads.updatedAt,
  createdAt: leads.createdAt,
} as const;

function buildOrder(sortKey: string | undefined, dir: "asc" | "desc" = "desc") {
  const column = SORTABLE[sortKey as keyof typeof SORTABLE] ?? leads.updatedAt;
  const primary = dir === "asc" ? asc(column) : desc(column);
  // Stable tiebreak so pagination never repeats or drops a row.
  return [sql`${primary} nulls last`, desc(leads.id)];
}
