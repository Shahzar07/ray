import type { Metadata } from "next";
import { subDays } from "date-fns";
import { requireSession, teamMembers } from "@/lib/auth/session";
import {
  getBatchQuality,
  getBestCallingHours,
  getDailySeries,
  getFunnel,
  getLeaderboard,
  getLostReasons,
} from "@/lib/queries/dashboard";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { RangeFilter } from "@/components/charts/range-filter";
import { parseRange, rangeDays, rangeLabel as labelFor } from "@/lib/domain/ranges";
import { StatTile } from "@/components/ui/display";
import { pct } from "@/lib/utils";
import {
  BatchQualityChart,
  CallingHoursChart,
  ConnectRateChart,
  DailyDialsChart,
  FunnelChart,
  LostReasonsChart,
} from "./analytics-charts";
import { Leaderboard, type LeaderRow } from "./leaderboard";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireSession();
  const params = await searchParams;
  const range = parseRange(params.days);
  const days = rangeDays(range);
  const rangeLabel = labelFor(range);

  const [funnel, daily, hours, batches, lostReasons, board, members] = await Promise.all([
    getFunnel(ctx.user.id, ctx.team.id),
    getDailySeries(ctx.team.id, days),
    getBestCallingHours(ctx.team.id, days),
    getBatchQuality(ctx.team.id),
    getLostReasons(ctx.team.id),
    getLeaderboard(ctx.team.id, subDays(new Date(), days), new Date()),
    teamMembers(ctx.team.id),
  ]);

  const rows = daily.map((d) => ({
    date: String(d.date),
    userId: d.userId,
    name: d.name,
    dials: d.dials,
    answered: d.answered,
  }));

  const leaderboard: LeaderRow[] = board.map((row) => ({
    ...row,
    streak: streakFor(rows, row.userId),
  }));

  const totals = rows.reduce(
    (acc, r) => ({ dials: acc.dials + r.dials, answered: acc.answered + r.answered }),
    { dials: 0, answered: 0 },
  );
  const converted = board.reduce((sum, r) => sum + r.converted, 0);
  const interested = board.reduce((sum, r) => sum + r.interested, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="The whole team sees this — the leaderboard included"
        actions={<RangeFilter days={range} />}
      />

      <PageBody className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Dials" value={totals.dials.toLocaleString()} sub={rangeLabel.toLowerCase()} tone="accent" />
          <StatTile
            label="Connect rate"
            value={pct(totals.answered, totals.dials)}
            sub={`${totals.answered.toLocaleString()} answered`}
            tone="info"
          />
          <StatTile label="Interested" value={interested.toLocaleString()} sub="warm or hot" tone="warning" />
          <StatTile label="Converted" value={converted.toLocaleString()} sub="new paying clients" tone="success" />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <DailyDialsChart
            rows={rows}
            tz={ctx.user.timezone}
            members={members.map((m) => ({ id: m.id, name: m.name ?? m.email }))}
          />
          <ConnectRateChart rows={rows} tz={ctx.user.timezone} />
        </section>

        <Leaderboard rows={leaderboard} rangeLabel={rangeLabel} meId={ctx.user.id} />

        <section className="grid gap-4 xl:grid-cols-2">
          <CallingHoursChart rows={hours} />
          <LostReasonsChart rows={lostReasons} />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <FunnelChart steps={funnel} />
          <BatchQualityChart rows={batches} />
        </section>
      </PageBody>
    </>
  );
}

/**
 * Consecutive days, ending today or yesterday, on which this caller logged a
 * dial. Yesterday counts as alive so the badge does not blink out every
 * morning before the first call of the day.
 */
function streakFor(rows: Array<{ date: string; userId: string; dials: number }>, userId: string): number {
  const active = new Set(rows.filter((r) => r.userId === userId && r.dials > 0).map((r) => r.date));
  if (active.size === 0) return 0;

  const key = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  let cursor = active.has(key(today)) ? today : subDays(today, 1);
  if (!active.has(key(cursor))) return 0;

  let streak = 0;
  while (active.has(key(cursor))) {
    streak++;
    cursor = subDays(cursor, 1);
  }
  return streak;
}
