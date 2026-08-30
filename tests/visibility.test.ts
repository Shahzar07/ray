/**
 * The security core. These run against a real Postgres because the visibility
 * rules are expressed as queries — mocking the DB would test the mock.
 *
 *   DATABASE_URL=postgres://... pnpm test
 *
 * Each test builds its own org/teams/users in a transaction-free scratch org
 * and tears it down afterwards, so it is safe to run against a dev database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { poolConfig } from "@/lib/db/ssl";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import {
  assertCan,
  assertCanEditLead,
  assertCanManageTeam,
  leadAccess,
  PermissionError,
  visibleUserIds,
} from "../src/lib/auth/visibility";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set to run the permission tests.");

const pool = new Pool(poolConfig(url));
const db = drizzle(pool, { schema });

const { organizations, teams, users, memberships, leads, leadVisibilityLinks } = schema;

type Fixture = {
  orgId: string;
  otherOrgId: string;
  teamA: string;
  teamB: string;
  owner: string;
  leadA: string; // team lead of team A
  sara: string; // agent, team A
  usman: string; // agent, team A — Sara can see him, he cannot see Sara
  hina: string; // agent, team A — unlinked to everyone
  manager: string; // manager, team A — org-wide reach, no org administration
  researcher: string; // researcher, team A — sees the team, calls nobody
  viewer: string; // viewer, team A — read-only
  outsider: string; // team lead of a different org
  leads: Record<string, string>;
};

let f: Fixture;

async function makeUser(name: string) {
  const [row] = await db
    .insert(users)
    .values({ name, email: `${name}-${crypto.randomUUID()}@test.local`, passwordHash: "x" })
    .returning({ id: users.id });
  return row!.id;
}

async function makeLead(orgId: string, teamId: string, assignedTo: string | null, name: string) {
  const [row] = await db
    .insert(leads)
    .values({
      orgId,
      teamId,
      assignedTo,
      fullName: name,
      phonePrimary: `+9230${Math.floor(Math.random() * 100_000_000)}`,
    })
    .returning({ id: leads.id });
  return row!.id;
}

beforeAll(async () => {
  const [org] = await db.insert(organizations).values({ name: `test-org-${Date.now()}` }).returning();
  const [otherOrg] = await db.insert(organizations).values({ name: `other-org-${Date.now()}` }).returning();
  const [a] = await db.insert(teams).values({ orgId: org!.id, name: "Team A" }).returning();
  const [b] = await db.insert(teams).values({ orgId: org!.id, name: "Team B" }).returning();
  const [outsideTeam] = await db.insert(teams).values({ orgId: otherOrg!.id, name: "Outside" }).returning();

  const owner = await makeUser("owner");
  const leadA = await makeUser("teamlead");
  const sara = await makeUser("sara");
  const usman = await makeUser("usman");
  const hina = await makeUser("hina");
  const manager = await makeUser("manager");
  const researcher = await makeUser("researcher");
  const viewer = await makeUser("viewer");
  const bTeamAgent = await makeUser("bagent");
  const outsider = await makeUser("outsider");

  await db.insert(memberships).values([
    { teamId: a!.id, userId: owner, role: "owner" },
    { teamId: a!.id, userId: leadA, role: "team_lead" },
    { teamId: a!.id, userId: sara, role: "agent" },
    { teamId: a!.id, userId: usman, role: "agent" },
    { teamId: a!.id, userId: hina, role: "agent" },
    { teamId: a!.id, userId: manager, role: "manager" },
    { teamId: a!.id, userId: researcher, role: "researcher" },
    { teamId: a!.id, userId: viewer, role: "viewer" },
    { teamId: b!.id, userId: bTeamAgent, role: "agent" },
    { teamId: outsideTeam!.id, userId: outsider, role: "team_lead" },
  ]);

  // One directional grant: Sara may see Usman's leads. Nothing the other way.
  await db.insert(leadVisibilityLinks).values({
    teamId: a!.id,
    viewerUserId: sara,
    targetUserId: usman,
    createdBy: owner,
  });

  f = {
    orgId: org!.id,
    otherOrgId: otherOrg!.id,
    teamA: a!.id,
    teamB: b!.id,
    owner,
    leadA,
    sara,
    usman,
    hina,
    manager,
    researcher,
    viewer,
    outsider,
    leads: {
      sara: await makeLead(org!.id, a!.id, sara, "Sara's lead"),
      usman: await makeLead(org!.id, a!.id, usman, "Usman's lead"),
      hina: await makeLead(org!.id, a!.id, hina, "Hina's lead"),
      teamLead: await makeLead(org!.id, a!.id, leadA, "Team lead's lead"),
      teamB: await makeLead(org!.id, b!.id, bTeamAgent, "Team B lead"),
      unassigned: await makeLead(org!.id, a!.id, null, "Unassigned lead"),
    },
  };
});

afterAll(async () => {
  if (f) {
    await db.delete(organizations).where(eq(organizations.id, f.orgId));
    await db.delete(organizations).where(eq(organizations.id, f.otherOrgId));
    for (const id of [
      f.owner,
      f.leadA,
      f.sara,
      f.usman,
      f.hina,
      f.manager,
      f.researcher,
      f.viewer,
      f.outsider,
    ]) {
      await db.delete(users).where(eq(users.id, id));
    }
  }
  await pool.end();
});

describe("visibleUserIds", () => {
  it("an agent sees only themself when nothing is linked to them", async () => {
    const visible = await visibleUserIds(f.hina, f.teamA, db);
    expect(visible).toEqual([f.hina]);
  });

  it("an agent CAN see a peer they hold a link for", async () => {
    const visible = await visibleUserIds(f.sara, f.teamA, db);
    expect(visible).toContain(f.sara);
    expect(visible).toContain(f.usman);
  });

  it("the link is one-directional — the target does not gain sight of the viewer", async () => {
    const visible = await visibleUserIds(f.usman, f.teamA, db);
    expect(visible).toEqual([f.usman]);
    expect(visible).not.toContain(f.sara);
  });

  it("a team lead sees every member of their own team", async () => {
    const visible = await visibleUserIds(f.leadA, f.teamA, db);
    expect(visible).toEqual(expect.arrayContaining([f.owner, f.leadA, f.sara, f.usman, f.hina]));
  });

  it("a team lead sees nothing in a team they do not belong to", async () => {
    const visible = await visibleUserIds(f.leadA, f.teamB, db);
    expect(visible).toEqual([]);
  });

  it("an owner sees every user in the org, across all teams", async () => {
    const visible = await visibleUserIds(f.owner, f.teamA, db);
    expect(visible.length).toBeGreaterThanOrEqual(6);
    expect(visible).toEqual(expect.arrayContaining([f.sara, f.usman, f.hina, f.leadA]));
  });

  it("a user from another org sees nothing here, even as a team lead there", async () => {
    const visible = await visibleUserIds(f.outsider, f.teamA, db);
    expect(visible).toEqual([]);
  });
});

describe("leadAccess", () => {
  it("an agent cannot read an unlinked peer's lead", async () => {
    const access = await leadAccess(f.hina, f.leads.sara!, db);
    expect(access.canView).toBe(false);
    expect(access.canEdit).toBe(false);
  });

  it("an agent CAN read a linked peer's lead, but only read it", async () => {
    const access = await leadAccess(f.sara, f.leads.usman!, db);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
  });

  it("an agent can edit their own lead", async () => {
    const access = await leadAccess(f.sara, f.leads.sara!, db);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
  });

  it("an agent cannot reassign or delete anything", async () => {
    const access = await leadAccess(f.sara, f.leads.sara!, db);
    expect(access.canReassign).toBe(false);
    expect(access.canDelete).toBe(false);
  });

  it("a team lead can edit any lead in their team", async () => {
    const access = await leadAccess(f.leadA, f.leads.hina!, db);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.canReassign).toBe(true);
  });

  it("a team lead cannot touch another team's lead", async () => {
    const access = await leadAccess(f.leadA, f.leads.teamB!, db);
    expect(access.canView).toBe(false);
    expect(access.canEdit).toBe(false);
  });

  it("an owner can edit everything, including other teams", async () => {
    const access = await leadAccess(f.owner, f.leads.teamB!, db);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
  });

  it("an unassigned lead is visible and editable inside the team", async () => {
    const access = await leadAccess(f.hina, f.leads.unassigned!, db);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(true);
  });
});

describe("assertCanEditLead", () => {
  it("throws for a peer's lead the agent may only read", async () => {
    await expect(assertCanEditLead(f.sara, f.leads.usman!, db)).rejects.toBeInstanceOf(PermissionError);
  });

  it("throws for a lead the agent cannot see at all", async () => {
    await expect(assertCanEditLead(f.hina, f.leads.sara!, db)).rejects.toBeInstanceOf(PermissionError);
  });

  it("resolves for the agent's own lead", async () => {
    await expect(assertCanEditLead(f.sara, f.leads.sara!, db)).resolves.toBeUndefined();
  });
});

describe("assertCanManageTeam", () => {
  it("rejects an agent", async () => {
    await expect(assertCanManageTeam(f.sara, f.teamA, db)).rejects.toBeInstanceOf(PermissionError);
  });

  it("allows a team lead in their own team", async () => {
    await expect(assertCanManageTeam(f.leadA, f.teamA, db)).resolves.toBe("team_lead");
  });

  it("rejects a team lead in a team they do not belong to", async () => {
    await expect(assertCanManageTeam(f.leadA, f.teamB, db)).rejects.toBeInstanceOf(PermissionError);
  });

  it("allows an owner anywhere in their org", async () => {
    await expect(assertCanManageTeam(f.owner, f.teamB, db)).resolves.toBe("owner");
  });
});

/**
 * The roles added after launch. These matter more than their number suggests:
 * before capabilities existed the app decided "is this a manager?" by asking
 * `role !== "agent"`, and under that test a read-only viewer would have been
 * handed bulk delete. Several of these are that exact regression.
 */
describe("manager", () => {
  it("sees every member of every team, like an owner", async () => {
    const ids = await visibleUserIds(f.manager, f.teamA, db);
    expect(ids).toContain(f.sara);
    expect(ids).toContain(f.owner);
    // Team B is a different team in the same org — org scope reaches it.
    const teamBIds = await visibleUserIds(f.manager, f.teamB, db);
    expect(teamBIds).toContain(f.sara);
  });

  it("manages a team it was never added to", async () => {
    await expect(assertCan(f.manager, f.teamB, "leads.manageAll", db)).resolves.toBe("manager");
  });

  it("edits, reassigns and deletes anyone's lead", async () => {
    const access = await leadAccess(f.manager, f.leads.sara!, db);
    expect(access).toMatchObject({ canView: true, canEdit: true, canDelete: true, canReassign: true });
  });

  it("cannot administer the organisation — that is the whole point of the role", async () => {
    await expect(assertCan(f.manager, f.teamA, "org.admin", db)).rejects.toBeInstanceOf(PermissionError);
  });

  it("still cannot reach another organisation", async () => {
    expect(await visibleUserIds(f.manager, f.outsider, db)).toEqual([]);
  });
});

describe("researcher", () => {
  it("sees the whole team, because deduping a list needs to", async () => {
    const ids = await visibleUserIds(f.researcher, f.teamA, db);
    expect(ids).toContain(f.sara);
    expect(ids).toContain(f.usman);
  });

  it("may import", async () => {
    await expect(assertCan(f.researcher, f.teamA, "leads.import", db)).resolves.toBe("researcher");
  });

  it("sees a lead and cannot touch it", async () => {
    const access = await leadAccess(f.researcher, f.leads.sara!, db);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.canDelete).toBe(false);
    await expect(assertCanEditLead(f.researcher, f.leads.sara!, db)).rejects.toBeInstanceOf(PermissionError);
  });

  it("cannot bulk-manage leads, despite not being an agent", async () => {
    // The `role !== "agent"` regression, stated directly.
    await expect(assertCanManageTeam(f.researcher, f.teamA, db)).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("viewer", () => {
  it("sees the team's leads", async () => {
    const access = await leadAccess(f.viewer, f.leads.sara!, db);
    expect(access.canView).toBe(true);
  });

  it("can change nothing at all", async () => {
    const access = await leadAccess(f.viewer, f.leads.sara!, db);
    expect(access).toMatchObject({ canEdit: false, canDelete: false, canReassign: false });
    await expect(assertCanEditLead(f.viewer, f.leads.sara!, db)).rejects.toBeInstanceOf(PermissionError);
  });

  it("cannot bulk-manage, import or export", async () => {
    // Each of these would have been granted by the old `role !== "agent"` test.
    await expect(assertCanManageTeam(f.viewer, f.teamA, db)).rejects.toBeInstanceOf(PermissionError);
    await expect(assertCan(f.viewer, f.teamA, "leads.import", db)).rejects.toBeInstanceOf(PermissionError);
    await expect(assertCan(f.viewer, f.teamA, "leads.export", db)).rejects.toBeInstanceOf(PermissionError);
  });

  it("cannot edit even a lead assigned to nobody", async () => {
    const access = await leadAccess(f.viewer, f.leads.unassigned!, db);
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
  });
});
