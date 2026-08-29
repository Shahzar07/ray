import "server-only";
import { subDays } from "date-fns";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dailyStats, leads, memberships, organizations, teams } from "@/lib/db/schema";
import { notify, recordActivities } from "@/lib/actions/activity";
import { writeBrief } from "@/lib/ai/features";

/**
 * Nightly. Four jobs that all want the day to be over:
 *   1. roll activities up into daily_stats, so analytics never scans them
 *   2. rescore open leads, which reorders tomorrow's Call Mode queue
 *   3. apply each org's give-up rule
 *   4. write the manager brief
 */
export async function runNightly(now = new Date()) {
  const aggregated = await aggregateDailyStats(now);
  const scored = await rescoreLeads();
  const retired = await applyCadenceRules(now);
  const briefs = await writeManagerBriefs(now);

  return { aggregated, scored, retired, briefs };
}

/**
 * Recomputes the last three days rather than just today: a call logged at
 * 23:58 in one timezone lands on a different date in another, and a re-run
 * should always converge on the same numbers.
 *
 * `daily_stats` is unique on (user_id, date), so a caller working leads across
 * two teams gets one row; the team recorded is the one most of that day's work
 * belonged to.
 */
async function aggregateDailyStats(now: Date): Promise<number> {
  const since = subDays(now, 3);

  const result = await db.execute(sql`
    insert into daily_stats (
      org_id, team_id, user_id, date,
      dials, answered, interested, demos_scheduled, trials_started,
      converted, lost, notes_added, follow_ups_completed
    )
    select
      (array_agg(l.org_id order by l.org_id))[1] as org_id,
      mode() within group (order by l.team_id) as team_id,
      a.user_id,
      (a.created_at at time zone o.timezone)::date as day,
      count(*) filter (where a.type = 'call')::int,
      count(*) filter (where a.call_outcome = 'answered')::int,
      count(*) filter (where a.type = 'status_change' and a.to_value->>'status' = 'interested')::int,
      count(*) filter (where a.type = 'trial_event' and a.to_value->>'trialStatus' = 'scheduled')::int,
      count(*) filter (where a.type = 'trial_event' and a.to_value->>'trialStatus' = 'active')::int,
      count(*) filter (
        where (a.type = 'status_change' and a.to_value->>'status' = 'converted')
           or (a.type = 'trial_event' and a.to_value->>'trialStatus' = 'converted')
      )::int,
      count(*) filter (where a.type = 'status_change' and a.to_value->>'status' in ('lost','not_interested'))::int,
      count(*) filter (where a.type = 'note')::int,
      count(*) filter (where a.type = 'follow_up_set')::int
    from activities a
    join leads l on l.id = a.lead_id
    join organizations o on o.id = l.org_id
    where a.user_id is not null and a.created_at >= ${since}
    group by a.user_id, day
    on conflict (user_id, date) do update set
      dials = excluded.dials,
      answered = excluded.answered,
      interested = excluded.interested,
      demos_scheduled = excluded.demos_scheduled,
      trials_started = excluded.trials_started,
      converted = excluded.converted,
      lost = excluded.lost,
      notes_added = excluded.notes_added,
      follow_ups_completed = excluded.follow_ups_completed
  `);

  return rowCount(result);
}

/**
 * Lead scoring, phase 1: pure statistics, no model call. The brief is explicit
 * that an LLM only earns a place here if this proves weak.
 *
 * Every term is something a caller would agree with out loud:
 *   · a batch that has converted before probably will again
 *   · someone who has picked up once will pick up again
 *   · dialling the same number five times with no answer is a signal
 *   · stated interest outranks all of it
 *
 * Weights are deliberately scaled so a realistic best-case lead lands in the
 * low 90s rather than pinning at 100 — a clamped score is a tie, and ties in
 * the top band are exactly where Call Mode needs the ordering to mean something.
 */
async function rescoreLeads(): Promise<number> {
  const result = await db.execute(sql`
    with batch_quality as (
      select
        source_batch_id,
        count(*) filter (where converted_at is not null)::float / greatest(count(*), 1) as convert_rate,
        count(*) filter (where connects_count > 0)::float / greatest(count(*), 1) as connect_rate
      from leads
      where source_batch_id is not null
      group by source_batch_id
      having count(*) >= 10
    ),
    scored as (
      select
        l.id,
        greatest(0, least(100, (
            35
          + case l.interest_level
              when 'hot' then 22
              when 'warm' then 9
              when 'cold' then -12
              else 0
            end
          + case when l.connects_count > 0 then 10 else 0 end
          + case
              when l.attempts_count > 0 and l.connects_count = 0
              then -least(l.attempts_count * 4, 22)
              else 0
            end
          + coalesce(round(bq.convert_rate * 18 + bq.connect_rate * 7)::int, 0)
          + case when l.created_at > now() - interval '14 days' then 4 else 0 end
          + case when l.next_follow_up_at is not null and l.next_follow_up_at <= now() then 5 else 0 end
        )::int)) as score
      from leads l
      left join batch_quality bq on bq.source_batch_id = l.source_batch_id
      where l.is_archived = false
        and l.status not in ('converted','lost','not_interested','wrong_number','do_not_call')
    )
    update leads l
    set score = s.score
    from scored s
    where s.id = l.id and l.score is distinct from s.score
  `);

  return rowCount(result);
}

/**
 * Each org's give-up rule, off by default. Retiring a lead is a status change
 * like any other, so it is written to the activity log with a reason — nobody
 * should have to guess why a lead went Lost overnight.
 */
async function applyCadenceRules(now: Date): Promise<number> {
  const orgs = await db
    .select({
      id: organizations.id,
      maxAttempts: organizations.cadenceMaxAttempts,
      windowDays: organizations.cadenceWindowDays,
    })
    .from(organizations)
    .where(eq(organizations.cadenceEnabled, true));

  let retired = 0;
  for (const org of orgs) {
    const cutoff = subDays(now, org.windowDays);
    const stale = await db
      .select({ id: leads.id, attempts: leads.attemptsCount, status: leads.status })
      .from(leads)
      .where(
        and(
          eq(leads.orgId, org.id),
          eq(leads.isArchived, false),
          eq(leads.connectsCount, 0),
          gte(leads.attemptsCount, org.maxAttempts),
          sql`${leads.lastAttemptedAt} is not null and ${leads.lastAttemptedAt} <= ${cutoff}`,
          sql`${leads.status} not in ('converted','lost','not_interested','wrong_number','do_not_call')`,
        ),
      )
      .limit(500);

    if (stale.length === 0) continue;

    await db
      .update(leads)
      .set({ status: "lost", lostReason: "unreachable", nextFollowUpAt: null, updatedAt: now })
      .where(
        inArray(
          leads.id,
          stale.map((s) => s.id),
        ),
      );

    await recordActivities(
      stale.map((lead) => ({
        leadId: lead.id,
        userId: null,
        type: "status_change" as const,
        body: `Retired automatically — ${lead.attempts} attempts with no connect in ${org.windowDays} days`,
        toValue: { status: "lost", lostReason: "unreachable", rule: "cadence" },
      })),
    );
    retired += stale.length;
  }

  return retired;
}

/**
 * The nightly manager brief, in plain language. This is the version that runs
 * with no API key at all — the AI layer replaces the prose, never the numbers.
 */
async function writeManagerBriefs(now: Date): Promise<number> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      dials: sql<number>`coalesce(sum(${dailyStats.dials}), 0)::int`,
      answered: sql<number>`coalesce(sum(${dailyStats.answered}), 0)::int`,
      converted: sql<number>`coalesce(sum(${dailyStats.converted}), 0)::int`,
      interested: sql<number>`coalesce(sum(${dailyStats.interested}), 0)::int`,
    })
    .from(teams)
    .leftJoin(
      dailyStats,
      and(eq(dailyStats.teamId, teams.id), eq(dailyStats.date, today.toISOString().slice(0, 10))),
    )
    .groupBy(teams.id, teams.name);

  let sent = 0;
  for (const row of rows) {
    const managers = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.teamId, row.teamId), inArray(memberships.role, ["owner", "team_lead"])));
    if (managers.length === 0) continue;

    const [pipeline] = await db
      .select({
        overdue: sql<number>`count(*) filter (where ${leads.nextFollowUpAt} <= now() and ${leads.status} not in ('converted','lost','not_interested','wrong_number','do_not_call'))::int`,
        pending: sql<number>`count(*) filter (where ${leads.trialStatus} = 'ended_pending')::int`,
        endingSoon: sql<number>`count(*) filter (where ${leads.trialStatus} = 'active' and ${leads.trialEndsAt} <= now() + interval '2 days')::int`,
      })
      .from(leads)
      .where(and(eq(leads.teamId, row.teamId), eq(leads.isArchived, false)));

    const rate = row.dials > 0 ? Math.round((row.answered / row.dials) * 100) : 0;
    const facts = {
      team: row.teamName,
      dials: row.dials,
      answered: row.answered,
      connectRatePercent: rate,
      markedInterested: row.interested,
      converted: row.converted,
      trialsEndingWithin48h: pipeline?.endingSoon ?? 0,
      trialsAwaitingDecision: pipeline?.pending ?? 0,
      overdueFollowUps: pipeline?.overdue ?? 0,
    };

    const parts = [
      `${row.dials} dials, ${row.answered} answered (${rate}%)`,
      row.interested > 0 ? `${row.interested} marked interested` : null,
      row.converted > 0 ? `${row.converted} converted` : null,
      facts.trialsEndingWithin48h > 0
        ? `${facts.trialsEndingWithin48h} demo ${facts.trialsEndingWithin48h === 1 ? "week ends" : "weeks end"} within 48h`
        : null,
      facts.trialsAwaitingDecision > 0
        ? `${facts.trialsAwaitingDecision} ${facts.trialsAwaitingDecision === 1 ? "trial is" : "trials are"} awaiting a decision`
        : null,
      facts.overdueFollowUps > 0
        ? `${facts.overdueFollowUps} overdue follow-${facts.overdueFollowUps === 1 ? "up" : "ups"}`
        : null,
    ].filter(Boolean);

    /* The numbers above are the brief. AI only rewrites the prose around them,
       and only if it answers in time — a failed or slow call leaves the plain
       version, which is already correct and complete. */
    const written = await writeBrief(facts);
    const title = written.ok
      ? written.data.headline
      : `${row.teamName} today: ${row.dials} dials, ${row.converted} converted`;
    const body = written.ok ? `${written.data.body}\n\n${parts.join(" · ")}` : parts.join(" · ");

    for (const manager of managers) {
      await notify({ userId: manager.userId, type: "daily_brief", title, body, link: "/analytics" });
      sent++;
    }
  }

  return sent;
}

/**
 * Weekly. One rollup for managers, and a size check so the free tier's 0.5 GB
 * ceiling is something you get warned about rather than hit.
 */
export async function runWeeklyRollup(now = new Date()) {
  const since = subDays(now, 7);

  const [size] = await rows<{ bytes: string }>(
    sql`select pg_database_size(current_database())::text as bytes`,
  );
  const bytes = Number(size?.bytes ?? 0);
  const usedPct = Math.round((bytes / (512 * 1024 * 1024)) * 100);

  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams);
  let sent = 0;

  for (const team of teamRows) {
    const [week] = await db
      .select({
        dials: sql<number>`coalesce(sum(${dailyStats.dials}), 0)::int`,
        answered: sql<number>`coalesce(sum(${dailyStats.answered}), 0)::int`,
        converted: sql<number>`coalesce(sum(${dailyStats.converted}), 0)::int`,
      })
      .from(dailyStats)
      .where(
        and(eq(dailyStats.teamId, team.id), gte(dailyStats.date, since.toISOString().slice(0, 10))),
      );

    const managers = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.teamId, team.id), inArray(memberships.role, ["owner", "team_lead"])));

    for (const manager of managers) {
      await notify({
        userId: manager.userId,
        type: "weekly_rollup",
        title: `${team.name} last week: ${week?.dials ?? 0} dials, ${week?.converted ?? 0} converted`,
        body:
          usedPct >= 75
            ? `Connect rate ${week && week.dials ? Math.round((week.answered / week.dials) * 100) : 0}%. Heads up: the database is at ${usedPct}% of the free tier.`
            : `Connect rate ${week && week.dials ? Math.round((week.answered / week.dials) * 100) : 0}%.`,
        link: "/analytics?days=7",
      });
      sent++;
    }
  }

  return { sent, storagePct: usedPct };
}

/* -------------------------------------------------------------- */

type Executed = { rowCount?: number | null; length?: number };

function rowCount(result: unknown): number {
  const r = result as Executed;
  return r?.rowCount ?? (Array.isArray(result) ? result.length : 0) ?? 0;
}

async function rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute<T>(query);
  return (Array.isArray(result) ? result : result.rows) as T[];
}
