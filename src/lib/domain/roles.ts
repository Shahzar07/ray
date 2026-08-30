import type { Role } from "@/lib/db/schema";

/**
 * What each role may do, as data.
 *
 * This exists because the app used to ask `role !== "agent"` whenever it meant
 * "is this person a manager?". With three roles that happened to be true. It is
 * not true any more: a `viewer` is not an agent, and under the old test a
 * read-only stakeholder would have been handed bulk delete. Every permission
 * question now goes through `can()`, so adding a seventh role is a row in this
 * table rather than a hunt for comparisons that quietly changed meaning.
 *
 * Two independent axes, deliberately kept apart:
 *   - `CAPABILITIES` — what you may *do*.
 *   - `visibilityScope` — whose leads you may *see*.
 * A researcher, for example, sees the whole team but may not call any of them.
 */
export const ROLES = ["owner", "manager", "team_lead", "agent", "researcher", "viewer"] as const;

export type Capability =
  /** See the lead surfaces at all. */
  | "leads.view"
  /** Log a call, write a note, edit a lead assigned to you. */
  | "leads.editOwn"
  /** Reassign, bulk edit and delete anyone's lead within your scope. */
  | "leads.manageAll"
  /** Bring a scraped sheet in, and undo a batch. */
  | "leads.import"
  /** Pull the list back out as CSV. */
  | "leads.export"
  /** Use Call Mode. */
  | "calls.log"
  /** The funnel, the trends, your own numbers. */
  | "analytics.view"
  /** Other people's numbers — the leaderboard and the per-member table. */
  | "team.performance"
  /** Custom fields and the do-not-call register — list hygiene. */
  | "data.curate"
  /** Org name, timezone, calling window, cadence. */
  | "team.settings"
  /** Invite people, set their targets, change roles below owner. */
  | "members.manage"
  /** Mint owners, create teams, deactivate people. Owner only. */
  | "org.admin";

const ALL: Capability[] = [
  "leads.view",
  "leads.editOwn",
  "leads.manageAll",
  "leads.import",
  "leads.export",
  "calls.log",
  "analytics.view",
  "team.performance",
  "data.curate",
  "team.settings",
  "members.manage",
  "org.admin",
];

const CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  /* Everything, including the actions that cannot be undone. */
  owner: new Set(ALL),

  /* Runs the operation day to day. Identical to an owner except it cannot
     change who owns the business — no minting owners, no creating teams, no
     deactivating people. That is the whole point of the role: full authority
     over the work, none over the account. */
  manager: new Set(ALL.filter((c) => c !== "org.admin")),

  /* Same powers as a manager, but `visibilityScope` confines them to one team. */
  team_lead: new Set(ALL.filter((c) => c !== "org.admin")),

  /* Works their own leads. Can export, because what they get back is only ever
     their own leads — the visibility layer already decided that. */
  agent: new Set<Capability>([
    "leads.view",
    "leads.editOwn",
    "leads.export",
    "calls.log",
    "analytics.view",
  ]),

  /* Builds and cleans the lists. Imports, curates fields and the DNC register,
     and can export what they assembled — but never calls anyone and sees no
     performance figures, because judging callers is not their job. */
  researcher: new Set<Capability>([
    "leads.view",
    "leads.import",
    "leads.export",
    "data.curate",
  ]),

  /* Read-only, and genuinely read-only: no export either, because a CSV of
     every lead is not "viewing". */
  viewer: new Set<Capability>(["leads.view", "analytics.view", "team.performance"]),
};

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES[role].has(capability);
}

/** Handy for the places that need any one of a set. */
export function canAny(role: Role, ...capabilities: Capability[]): boolean {
  return capabilities.some((c) => can(role, c));
}

/**
 * Whose leads this role may see.
 *   org  — every member of every team in the organisation
 *   team — every member of their own team
 *   own  — themselves, plus anyone they hold a visibility link for
 */
export type VisibilityScope = "org" | "team" | "own";

export function visibilityScope(role: Role): VisibilityScope {
  switch (role) {
    case "owner":
    case "manager":
      return "org";
    case "team_lead":
    case "researcher":
    case "viewer":
      return "team";
    case "agent":
      return "own";
  }
}

/**
 * Whether a daily dial/connect target means anything for this role.
 *
 * Targets exist to pace the people doing the calling, and only team leads and
 * agents work a book of leads. An owner or manager who picks up the phone
 * occasionally is not working to a quota, and showing them a permanently
 * unmet ring on /today reads as failure rather than as "not your job".
 * Researchers and viewers never call at all.
 */
export function hasDailyTargets(role: Role): boolean {
  return role === "team_lead" || role === "agent";
}

/**
 * Roles a given role may hand out. Nobody can promote someone above
 * themselves, and only an owner can mint another owner.
 */
export function assignableRoles(actor: Role): Role[] {
  if (can(actor, "org.admin")) return [...ROLES];
  if (can(actor, "members.manage")) return ROLES.filter((r) => r !== "owner");
  return [];
}

/**
 * Every role holding a capability. The cron jobs use this to decide who a
 * nightly brief goes to, so a new managing role starts receiving one without
 * anybody remembering to add it to a list.
 */
export function rolesWith(capability: Capability): Role[] {
  return ROLES.filter((role) => can(role, capability));
}
