import { describe, expect, it } from "vitest";
import {
  ROLES,
  assignableRoles,
  can,
  hasDailyTargets,
  rolesWith,
  visibilityScope,
} from "@/lib/domain/roles";

/**
 * Invariants over the capability table itself. No database — these catch a
 * mistyped row the moment it is added, which is the whole reason permissions
 * are data here rather than scattered comparisons.
 */
describe("the capability matrix", () => {
  it("gives exactly one role the power to administer the organisation", () => {
    expect(rolesWith("org.admin")).toEqual(["owner"]);
  });

  it("lets every role see leads — a role that sees nothing has no reason to exist", () => {
    for (const role of ROLES) expect(can(role, "leads.view")).toBe(true);
  });

  it("never grants a write without the read it depends on", () => {
    for (const role of ROLES) {
      if (can(role, "leads.editOwn") || can(role, "leads.manageAll")) {
        expect(can(role, "leads.view")).toBe(true);
      }
    }
  });

  it("keeps the viewer genuinely read-only", () => {
    const writes = [
      "leads.editOwn",
      "leads.manageAll",
      "leads.import",
      "leads.export",
      "calls.log",
      "data.curate",
      "team.settings",
      "members.manage",
      "org.admin",
    ] as const;
    for (const capability of writes) expect(can("viewer", capability)).toBe(false);
  });

  it("keeps the researcher out of calling and out of other people's numbers", () => {
    expect(can("researcher", "leads.import")).toBe(true);
    expect(can("researcher", "data.curate")).toBe(true);
    expect(can("researcher", "calls.log")).toBe(false);
    expect(can("researcher", "team.performance")).toBe(false);
    expect(can("researcher", "leads.manageAll")).toBe(false);
  });

  it("makes a manager an owner in everything but ownership", () => {
    const everythingOperational = [
      "leads.manageAll",
      "leads.import",
      "leads.export",
      "team.settings",
      "members.manage",
      "team.performance",
    ] as const;
    for (const capability of everythingOperational) {
      expect(can("manager", capability)).toBe(true);
    }
    expect(can("manager", "org.admin")).toBe(false);
  });

  it("scopes each role to org, team or own — and only the agent to own", () => {
    expect(ROLES.filter((r) => visibilityScope(r) === "org")).toEqual(["owner", "manager"]);
    expect(ROLES.filter((r) => visibilityScope(r) === "own")).toEqual(["agent"]);
  });

  it("never lets anyone hand out a role above their own", () => {
    // Only an owner can mint another owner; nobody else may offer it.
    expect(assignableRoles("owner")).toContain("owner");
    for (const role of ROLES.filter((r) => r !== "owner")) {
      expect(assignableRoles(role)).not.toContain("owner");
    }
    // And roles with no member management hand out nothing at all.
    expect(assignableRoles("agent")).toEqual([]);
    expect(assignableRoles("viewer")).toEqual([]);
    expect(assignableRoles("researcher")).toEqual([]);
  });
});

describe("daily targets", () => {
  it("applies only to the roles that work a book of leads", () => {
    expect(ROLES.filter(hasDailyTargets)).toEqual(["team_lead", "agent"]);
  });

  it("never targets a role that cannot log a call", () => {
    for (const role of ROLES) {
      if (hasDailyTargets(role)) expect(can(role, "calls.log")).toBe(true);
    }
  });
});

describe("pending-migration errors", () => {
  it("explains an enum value the database has never heard of", async () => {
    const { pendingMigrationMessage } = await import("@/lib/actions/db-errors");
    // Exactly what production raised when the roles shipped ahead of the migration.
    const error = Object.assign(new Error('Failed query: update "memberships" set "role" = $1'), {
      cause: new Error('invalid input value for enum role: "manager"'),
    });
    expect(pendingMigrationMessage(error)).toMatch(/migration is pending/);
  });

  it("leaves an ordinary failure alone", async () => {
    const { pendingMigrationMessage } = await import("@/lib/actions/db-errors");
    expect(pendingMigrationMessage(new Error("connection reset"))).toBeNull();
  });
});
