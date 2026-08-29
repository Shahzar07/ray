import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activities, leads, users, type InterestLevel, type LeadStatus } from "@/lib/db/schema";
import { visibleUserIds } from "@/lib/auth/visibility";
import { PIPELINE_ORDER } from "@/lib/domain/constants";

export type BoardCard = {
  id: string;
  fullName: string;
  company: string | null;
  phonePrimary: string;
  status: LeadStatus;
  interestLevel: InterestLevel | null;
  nextFollowUpAt: Date | null;
  assignedTo: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  /** When the lead last entered its current stage — drives "days in stage". */
  stageSince: Date;
};

/**
 * Kanban cards for the open pipeline. Closed statuses are deliberately absent:
 * the board is for work in flight, and the lead table is where lost and
 * do-not-call live.
 *
 * `stageSince` comes from the most recent status_change on the lead rather than
 * `updated_at`, which any edit would reset and make "3 days in stage" a lie.
 */
export async function getBoardCards(
  userId: string,
  teamId: string,
  assignee?: string,
  limit = 600,
): Promise<BoardCard[]> {
  const allowed = await visibleUserIds(userId, teamId);
  if (allowed.length === 0) return [];

  const scope = [
    eq(leads.teamId, teamId),
    eq(leads.isArchived, false),
    inArray(leads.status, PIPELINE_ORDER),
    or(inArray(leads.assignedTo, allowed), isNull(leads.assignedTo))!,
  ];
  // Never trust a posted assignee — narrow it to someone already visible.
  if (assignee && allowed.includes(assignee)) scope.push(eq(leads.assignedTo, assignee));

  const lastChange = db
    .select({
      leadId: activities.leadId,
      at: sql<Date>`max(${activities.createdAt})`.as("at"),
    })
    .from(activities)
    .where(eq(activities.type, "status_change"))
    .groupBy(activities.leadId)
    .as("last_change");

  const rows = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      company: leads.company,
      phonePrimary: leads.phonePrimary,
      status: leads.status,
      interestLevel: leads.interestLevel,
      nextFollowUpAt: leads.nextFollowUpAt,
      assignedTo: leads.assignedTo,
      assigneeName: users.name,
      assigneeAvatar: users.avatarUrl,
      stageSince: sql<Date>`coalesce(${lastChange.at}, ${leads.createdAt})`,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .leftJoin(lastChange, eq(lastChange.leadId, leads.id))
    .where(and(...scope))
    .orderBy(desc(leads.score), desc(leads.updatedAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, stageSince: new Date(row.stageSince) }));
}
