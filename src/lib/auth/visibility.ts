import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/lib/db/client";
import { leadVisibilityLinks, leads, memberships, teams, type Role } from "@/lib/db/schema";
import { can, visibilityScope, type Capability } from "@/lib/domain/roles";

/**
 * The single source of truth for "whose leads may this user see?".
 *
 * Scope comes from `visibilityScope(role)` in lib/domain/roles.ts, so a new
 * role is a row in that table rather than another branch here:
 *   org  (owner, manager)               — every member of every team in the org
 *   team (team_lead, researcher, viewer) — every member of their own team
 *   own  (agent)                        — themself, plus every user they hold a
 *          `lead_visibility_links` row for. A link is one-directional: granting
 *          A sight of B's leads never grants B sight of A's.
 *
 * Seeing is not touching. A researcher and a viewer both get the whole team
 * here and are still stopped from editing anything by `leadAccess`.
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
    // Not a member of this team. Someone with org-wide scope elsewhere in the
    // organisation still sees all of it.
    const wide = await orgWideMembership(userId, db);
    if (!wide) return [];
    const [team] = await db.select({ orgId: teams.orgId }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team || team.orgId !== wide.orgId) return [];
    return allUserIdsInOrg(wide.orgId, db);
  }

  const scope = visibilityScope(membership.role);

  if (scope === "org") {
    return allUserIdsInOrg(membership.orgId, db);
  }

  if (scope === "team") {
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

  const role: Role | null = membership?.role ?? (await orgWideMembership(userId, db))?.role ?? null;
  if (!role) return deny;

  const allowed = await visibleUserIds(userId, lead.teamId, db);
  const canView = lead.assignedTo === null || allowed.includes(lead.assignedTo);

  /* Managing beats owning: these roles edit, reassign and delete anything
     inside their scope. */
  if (can(role, "leads.manageAll")) {
    return { canView, canEdit: canView, canDelete: canView, canReassign: canView, role };
  }

  /* Everyone else edits only what is theirs, and only if they may edit at all.
     A researcher and a viewer see a lead and cannot touch it; an agent's view
     of a peer's lead is read-only for the same reason. */
  const isOwnLead = lead.assignedTo === userId || lead.assignedTo === null;
  const canEdit = canView && isOwnLead && can(role, "leads.editOwn");
  return { canView, canEdit, canDelete: false, canReassign: false, role };
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

/**
 * The general guard: does this user hold `capability` on this team?
 *
 * Resolves the role from the membership on that team, falling back to an
 * org-wide role held elsewhere in the same organisation — that fallback is
 * what lets an owner or manager act on a team they are not a member of.
 */
export async function assertCan(
  userId: string,
  teamId: string,
  capability: Capability,
  db: Database = defaultDb,
): Promise<Role> {
  const role = await roleOnTeam(userId, teamId, db);
  if (role && can(role, capability)) return role;
  throw new PermissionError(DENIAL[capability]);
}

/** Import, bulk assign, delete, team analytics. */
export async function assertCanManageTeam(
  userId: string,
  teamId: string,
  db: Database = defaultDb,
): Promise<Role> {
  return assertCan(userId, teamId, "leads.manageAll", db);
}

/**
 * Told in terms of what the person was trying to do, not which roles exist —
 * "only team leads and owners can do that" stopped being true the moment
 * managers and researchers arrived, and a wrong explanation is worse than a
 * vague one.
 */
const DENIAL: Record<Capability, string> = {
  "leads.view": "You do not have access to these leads.",
  "leads.editOwn": "Your role is read-only.",
  "leads.manageAll": "You cannot reassign or delete other people's leads.",
  "leads.import": "You cannot import leads.",
  "leads.export": "You cannot export leads.",
  "calls.log": "Your role does not make calls.",
  "analytics.view": "You do not have access to the analytics.",
  "team.performance": "You do not have access to other people's performance figures.",
  "data.curate": "You cannot change fields or the do-not-call list.",
  "team.settings": "You cannot change team settings.",
  "members.manage": "You cannot manage people on this team.",
  "org.admin": "Only an owner can do that.",
};

/** The role this user effectively holds on this team, or null. */
async function roleOnTeam(userId: string, teamId: string, db: Database): Promise<Role | null> {
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.teamId, teamId)))
    .limit(1);
  if (membership) return membership.role;

  const wide = await orgWideMembership(userId, db);
  if (!wide) return null;
  const [team] = await db.select({ orgId: teams.orgId }).from(teams).where(eq(teams.id, teamId)).limit(1);
  return team && team.orgId === wide.orgId ? wide.role : null;
}

/* -------------------------------------------------------------- */

/**
 * An org-scoped membership this user holds anywhere in the organisation.
 *
 * Was `isOrgOwner`, and widening it to any org-scoped role is what gives a
 * manager the same reach as an owner across teams they have not been added to.
 */
async function orgWideMembership(
  userId: string,
  db: Database,
): Promise<{ orgId: string; role: Role } | null> {
  const rows = await db
    .select({ orgId: teams.orgId, role: memberships.role })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(eq(memberships.userId, userId));
  return rows.find((r) => visibilityScope(r.role) === "org") ?? null;
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
