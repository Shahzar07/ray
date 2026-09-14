import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import {
  startSession,
  endSession,
  openSession,
  ownSessions,
} from "../src/lib/db/attendance";
import { assertCanManageTeam } from "../src/lib/auth/visibility";
import type { SessionContext } from "../src/lib/auth/session";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
let ctx: SessionContext;
let peer: string;
beforeAll(async () => {
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Attendance test" })
    .returning();
  const [team] = await db
    .insert(schema.teams)
    .values({ orgId: org!.id, name: "Test team" })
    .returning();
  const [user, other] = await db
    .insert(schema.users)
    .values([
      { name: "Test agent", email: `${crypto.randomUUID()}@test.local` },
      { name: "Peer", email: `${crypto.randomUUID()}@test.local` },
    ])
    .returning();
  peer = other!.id;
  await db.insert(schema.memberships).values([
    { userId: user!.id, teamId: team!.id, role: "agent" },
    { userId: peer, teamId: team!.id, role: "agent" },
  ]);
  await db
    .insert(schema.leadVisibilityLinks)
    .values({
      teamId: team!.id,
      viewerUserId: user!.id,
      targetUserId: peer,
      createdBy: user!.id,
    });
  ctx = {
    user: {
      id: user!.id,
      name: "Test",
      email: user!.email,
      timezone: "Asia/Karachi",
      avatarUrl: null,
    },
    org: {
      id: org!.id,
      name: "Test",
      timezone: "Asia/Karachi",
      callingWindowStart: 9,
      callingWindowEnd: 20,
    },
    team: { id: team!.id, name: "Test" },
    role: "agent",
    teams: [],
    dailyDialTarget: 60,
    dailyConnectTarget: 10,
  };
});
afterAll(async () => {
  if (ctx) {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, ctx.org.id));
    await db.delete(schema.users).where(eq(schema.users.id, ctx.user.id));
    await db.delete(schema.users).where(eq(schema.users.id, peer));
  }
  await pool.end();
});
describe("Persisted employee attendance", () => {
  it("deduplicates concurrent check-ins", async () => {
    const rows = await Promise.all(
      Array.from({ length: 5 }, () => startSession(ctx, db)),
    );
    expect(new Set(rows.map((r) => r!.id)).size).toBe(1);
    expect((await openSession(ctx.user.id, db))?.id).toBe(rows[0]!.id);
  });
  it("does not let a peer check out another user", async () => {
    const row = await openSession(ctx.user.id, db);
    expect(await endSession(peer, row!.id, db)).toBeNull();
    expect(await openSession(ctx.user.id, db)).not.toBeNull();
  });
  it("persists duration and permits multiple sessions, while stale checkout is harmless", async () => {
    const first = await openSession(ctx.user.id, db);
    const closed = await endSession(ctx.user.id, first!.id, db);
    expect(closed!.endedAt).toBeInstanceOf(Date);
    expect(closed!.durationSeconds).toBeGreaterThanOrEqual(0);
    const second = await startSession(ctx, db);
    expect(second!.id).not.toBe(first!.id);
    expect(await endSession(ctx.user.id, first!.id, db)).toBeNull();
    expect((await openSession(ctx.user.id, db))!.id).toBe(second!.id);
    const records = await ownSessions(
      ctx.user.id,
      second!.localDate.slice(0, 7),
      db,
    );
    expect(records).toHaveLength(2);
    await endSession(ctx.user.id, second!.id, db);
  });
  it("denies team attendance permissions to agents even with lead visibility links", async () => {
    await expect(
      assertCanManageTeam(ctx.user.id, ctx.team.id, db),
    ).rejects.toThrow();
    await db
      .update(schema.memberships)
      .set({ role: "team_lead" })
      .where(
        and(
          eq(schema.memberships.userId, ctx.user.id),
          eq(schema.memberships.teamId, ctx.team.id),
        ),
      );
    await expect(
      assertCanManageTeam(ctx.user.id, ctx.team.id, db),
    ).resolves.toBe("team_lead");
  });
});

it("blocks the attendance Data API surface with row-level security", async () => {
  const client = await pool.connect();
  const role = "attendance_read_test";
  try {
    await client.query(`create role ${role}`);
    await client.query(`grant usage on schema public to ${role}`);
    await client.query(`grant select on work_sessions to ${role}`);
    expect((await client.query("select count(*)::int as n from work_sessions")).rows[0].n).toBeGreaterThan(0);
    await client.query(`set role ${role}`);
    const result = await client.query("select count(*)::int as n from work_sessions");
    expect(result.rows[0].n).toBe(0);
  } finally {
    await client.query("reset role");
    await client.query(`drop owned by ${role}`);
    await client.query(`drop role ${role}`);
    client.release();
  }
});
