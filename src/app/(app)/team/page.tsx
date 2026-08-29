import type { Metadata } from "next";
import { subDays } from "date-fns";
import { requireTeamManager } from "@/lib/auth/session";
import { getActivityHeatmap, getTeamPerformance } from "@/lib/queries/dashboard";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { RangeFilter } from "@/components/charts/range-filter";
import { parseRange, rangeDays, rangeLabel as labelFor } from "@/lib/domain/ranges";
import { StatTile } from "@/components/ui/display";
import { pct } from "@/lib/utils";
import { TeamTable } from "./team-table";
import { ActivityHeatmap } from "./activity-heatmap";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireTeamManager();
  const params = await searchParams;
  const range = parseRange(params.days);
  const days = rangeDays(range);

  const [performance, heatmap] = await Promise.all([
    getTeamPerformance(ctx.team.id, subDays(new Date(), days), new Date()),
    getActivityHeatmap(ctx.team.id, days),
  ]);

  const totals = performance.reduce(
    (acc, row) => ({
      dials: acc.dials + row.dials,
      answered: acc.answered + row.answered,
      converted: acc.converted + row.converted,
      overdue: acc.overdue + row.overdue,
    }),
    { dials: 0, answered: 0, converted: 0, overdue: 0 },
  );

  const behind = performance.filter((row) => row.overdue > 0).length;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={`${performance.length} ${performance.length === 1 ? "caller" : "callers"} in ${ctx.team.name}`}
        actions={<RangeFilter days={range} />}
      />

      <PageBody className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Team dials" value={totals.dials.toLocaleString()} sub={labelFor(range).toLowerCase()} tone="accent" />
          <StatTile
            label="Connect rate"
            value={pct(totals.answered, totals.dials)}
            sub={`${totals.answered.toLocaleString()} answered`}
            tone="info"
          />
          <StatTile label="Converted" value={totals.converted.toLocaleString()} sub="new clients" tone="success" />
          <StatTile
            label="Overdue follow-ups"
            value={totals.overdue.toLocaleString()}
            sub={behind > 0 ? `across ${behind} ${behind === 1 ? "caller" : "callers"}` : "everyone is on top of it"}
            tone={totals.overdue > 0 ? "danger" : "success"}
          />
        </section>

        <TeamTable
          rangeLabel={labelFor(range)}
          rows={performance.map((row) => ({
            userId: row.userId,
            name: row.name,
            avatarUrl: row.avatarUrl,
            role: row.role as "owner" | "team_lead" | "agent",
            dials: row.dials,
            answered: row.answered,
            interested: row.interested,
            demosScheduled: row.demosScheduled,
            trialsStarted: row.trialsStarted,
            converted: row.converted,
            openLeads: row.openLeads,
            overdue: row.overdue,
            attemptsToConnect: row.attemptsToConnect,
            lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt).toISOString() : null,
          }))}
        />

        <ActivityHeatmap cells={heatmap} />
      </PageBody>
    </>
  );
}
