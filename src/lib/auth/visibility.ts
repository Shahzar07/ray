import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/lib/db/client";
import { leadVisibilityLinks, leads, memberships, teams, type Role } from "@/lib/db/schema";

/**
 * The single source of truth for "whose leads may this user see?".
 *
 * Rules (asymmetric by design):
 *   owner     — every member of every team in the org
 *   team_lead — every member of their own team
 *   agent     — themself, plus every user they hold a `lead_visibility_links`
 *               row for. A link is one-directional: granting A sight of B's
 *               leads never grants B sight of A's.
 *
 * Every lead read in the app goes through this. There is no second path.
 */
export async function visibleUserIds(
  userId: string,
  teamId: string,
  db: Database = defaultDb,
): Promise<string[]> {
  const [membership] = await db
    .select({ role: memberships.role, orgId: teams.orgId })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(and(eq(memberships.userId, userId), eq(memberships.teamId, teamId)))
    .limit(1);

  if (!membership) {
    // Not a member of this team. An owner elsewhere in the org still sees all.
    const owner = await isOrgOwner(userId, db);
    if (!owner) return [];
    const [team] = await db.select({ orgId: teams.orgId }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team || team.orgId !== owner.orgId) return [];
    return allUserIdsInOrg(owner.orgId, db);
  }

  if (membership.role === "owner") {
    return allUserIdsInOrg(membership.orgId, db);
  }

  if (membership.role === "team_lead") {
    const rows = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.teamId, teamId));
    return unique(rows.map((r) => r.userId));
  }

  const links = await db
    .select({ targetUserId: leadVisibilityLinks.targetUserId })
    .from(leadVisibilityLinks)
    .where(
      and(eq(leadVisibilityLinks.teamId, teamId), eq(leadVisibilityLinks.viewerUserId, userId)),
    );

  return unique([userId, ...links.map((l) => l.targetUserId)]);
}

/** The Drizzle predicate every lead query must be built on top of. */
export function leadVisibilityFilter(teamId: string, allowedUserIds: string[]) {
  if (allowedUserIds.length === 0) return sql`false`;
  return and(
    eq(leads.teamId, teamId),
    or(inArray(leads.assignedTo, allowedUserIds), sql`${leads.assignedTo} is null`),
  );
}

export type LeadAccess = {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReassign: boolean;
  role: Role | null;
};

/** Resolve what a user may do with one specific lead. */
export async function leadAccess(
  userId: string,
  leadId: string,
  db: Database = defaultDb,
): Promise<LeadAccess> {
  const deny: LeadAccess = { canView: false, canEdit: false, canDelete: false, canReassign: false, role: null };

  const [lead] = await db
    .select({ id: leads.id, teamId: leads.teamId, assignedTo: leads.assignedTo })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) return deny;

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.teamId, lead.teamId)))
    .limit(1);

  const role: Role | null = membership?.role ?? ((await isOrgOwner(userId, db)) ? "owner" : null);
  if (!role) return deny;

  if (role === "owner" || role === "team_lead") {
    return { canView: true, canEdit: true, canDelete: true, canReassign: true, role };
  }

  const allowed = await visibleUserIds(userId, lead.teamId, db);
  const canView = lead.assignedTo === null || allowed.includes(lead.assignedTo);
  // An agent edits only their own leads. Seeing a peer's lead is read-only.
  const isOwnLead = lead.assignedTo === userId || lead.assignedTo === null;
  return { canView, canEdit: canView && isOwnLead, canDelete: false, canReassign: false, role };
}

export class PermissionError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

/** Guard used by every lead mutation. Throws rather than returning a boolean. */
export async function assertCanEditLead(
  userId: string,
  leadId: string,
  db: Database = defaultDb,
): Promise<void> {
  const access = await leadAccess(userId, leadId, db);
  if (!access.canEdit) {
    throw new PermissionError(
      access.canView
        ? "This lead is assigned to someone else — you have read-only access."
        : "You do not have access to this lead.",
    );
  }
}

export async function assertCanViewLead(
  userId: string,
  leadId: string,
  db: Database = defaultDb,
): Promise<void> {
  const access = await leadAccess(userId, leadId, db);
  if (!access.canView) throw new PermissionError("You do not have access to this lead.");
}

/** team_lead and owner only — import, bulk assign, delete, team analytics. */
export async function assertCanManageTeam(
  userId: string,
  teamId: string,
  db: Database = defaultDb,
): Promise<Role> {
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.teamId, teamId)))
    .limit(1);

  if (membership && (membership.role === "owner" || membership.role === "team_lead")) {
    return membership.role;
  }
  const owner = await isOrgOwner(userId, db);
  if (owner) {
    const [team] = await db.select({ orgId: teams.orgId }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (team && team.orgId === owner.orgId) return "owner";
  }
  throw new PermissionError("Only team leads and owners can do that.");
}

/* -------------------------------------------------------------- */

async function isOrgOwner(userId: string, db: Database): Promise<{ orgId: string } | null> {
  const [row] = await db
    .select({ orgId: teams.orgId })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")))
    .limit(1);
  return row ?? null;
}

async function allUserIdsInOrg(orgId: string, db: Database): Promise<string[]> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(eq(teams.orgId, orgId));
  return unique(rows.map((r) => r.userId));
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
