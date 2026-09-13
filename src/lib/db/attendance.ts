import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "./client";
import { workSessions } from "./schema";
import type { SessionContext } from "@/lib/auth/session";
import { monthRange } from "@/lib/domain/attendance";

export async function openSession(userId: string, db: Database = defaultDb) {
  const [row] = await db
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, userId), isNull(workSessions.endedAt)))
    .limit(1);
  return row ?? null;
}

/** Unique index arbitrates concurrent check-ins across tabs and server instances. */
export async function startSession(
  ctx: SessionContext,
  db: Database = defaultDb,
) {
  const [row] = await db
    .insert(workSessions)
    .values({
      orgId: ctx.org.id,
      teamId: ctx.team.id,
      userId: ctx.user.id,
      startedAt: sql`statement_timestamp()`,
      localDate: sql`(statement_timestamp() at time zone ${ctx.user.timezone})::date`,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? (await openSession(ctx.user.id, db));
}

/** The ID makes a repeated/stale check-out harmless to a later shift. */
export async function endSession(
  userId: string,
  sessionId: string,
  db: Database = defaultDb,
) {
  const [row] = await db
    .update(workSessions)
    .set({
      endedAt: sql`greatest(statement_timestamp(), ${workSessions.startedAt})`,
      durationSeconds: sql`greatest(0, floor(extract(epoch from (statement_timestamp() - ${workSessions.startedAt}))))::int`,
    })
    .where(
      and(
        eq(workSessions.id, sessionId),
        eq(workSessions.userId, userId),
        isNull(workSessions.endedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function ownSessions(
  userId: string,
  month: string,
  db: Database = defaultDb,
) {
  const range = monthRange(month);
  return db
    .select()
    .from(workSessions)
    .where(
      and(
        eq(workSessions.userId, userId),
        gte(workSessions.localDate, range.from),
        lte(workSessions.localDate, range.to),
      ),
    )
    .orderBy(desc(workSessions.startedAt));
}
