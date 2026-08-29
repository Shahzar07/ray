"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS, ChartCard, ChartLegend, ChartTooltip, DataTable, GRID, TICK } from "@/components/charts/chart-kit";
import { EmptyState } from "@/components/ui/display";
import { SERIES_COLORS, LOST_REASON, TONE_HEX } from "@/lib/domain/constants";
import { fmt } from "@/lib/domain/dates";
import { pct } from "@/lib/utils";
import type { FunnelStep } from "@/lib/queries/dashboard";

/* ------------------------------------------------------------------ */
/* Funnel — ordered stages, so length carries the story and one hue    */
/* is enough. Each bar is direct-labelled with its step conversion.    */
/* ------------------------------------------------------------------ */

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.value ?? 0;
  if (top === 0) {
    return (
      <ChartCard title="Pipeline funnel" description="Every lead you can see, by how far it got.">
        <EmptyState compact title="No leads yet" description="Import a sheet and the funnel fills in." />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Pipeline funnel"
      description="Every lead you can see, by how far it got. All time."
      height={steps.length * 44}
      table={
        <DataTable
          caption="Pipeline funnel"
          columns={["Stage", "Leads", "From previous", "Of all leads"]}
          rows={steps.map((s) => [
            s.label,
            s.value,
            s.rate === null ? "—" : `${Math.round(s.rate)}%`,
            pct(s.value, top),
          ])}
        />
      }
    >
      <div className="flex h-full flex-col justify-between gap-1.5 px-3 pt-1">
        {steps.map((step) => (
          <div key={step.key} className="flex items-center gap-3">
            <span className="w-[104px] shrink-0 truncate text-[12px] text-muted">{step.label}</span>
            <div className="relative h-5 min-w-0 flex-1">
              <div
                className="h-full rounded-r-[4px] bg-accent transition-[width] duration-500"
                style={{ width: `${Math.max((step.value / top) * 100, step.value > 0 ? 1.5 : 0)}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-strong">
              {step.value.toLocaleString()}
            </span>
            <span className="w-11 shrink-0 text-right text-[11.5px] tabular-nums text-subtle">
              {step.rate === null ? "" : `${Math.round(step.rate)}%`}
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Dials per day, stacked by member                                    */
/* ------------------------------------------------------------------ */

export type DailyRow = { date: string; userId: string; name: string | null; dials: number; answered: number };
export type Member = { id: string; name: string };

export function DailyDialsChart({
  rows,
  members,
  tz,
}: {
  rows: DailyRow[];
  members: Member[];
  tz: string;
}) {
  /* Colour follows the member, never their position in the filtered data —
     someone who drops out of the range must not repaint everyone else. */
  const colorOf = React.useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m, i) => map.set(m.id, SERIES_COLORS[i % SERIES_COLORS.length]!));
    return map;
  }, [members]);

  const { data, active } = React.useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.dials === 0) continue;
      seen.add(row.userId);
      const entry = byDate.get(row.date) ?? { date: row.date };
      entry[row.userId] = ((entry[row.userId] as number) ?? 0) + row.dials;
      byDate.set(row.date, entry);
    }
    return {
      data: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
      active: members.filter((m) => seen.has(m.id)),
    };
  }, [rows, members]);

  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  if (data.length === 0) {
    return (
      <ChartCard title="Dials a day" description="Stacked by caller.">
        <EmptyState compact title="No calls logged in this range" description="Try a longer range." />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Dials a day"
      description="Stacked by caller."
      legend={<ChartLegend items={active.map((m) => ({ label: m.name, color: colorOf.get(m.id)! }))} />}
      table={
        <DataTable
          caption="Dials a day by caller"
          columns={["Day", ...active.map((m) => m.name), "Total"]}
          rows={data.map((d) => [
            fmt(String(d.date), "d MMM", tz),
            ...active.map((m) => (d[m.id] as number) ?? 0),
            active.reduce((sum, m) => sum + (((d[m.id] as number) ?? 0) as number), 0),
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid {...GRID} />
          <XAxis
            dataKey="date"
            {...AXIS}
            tick={TICK}
            tickFormatter={(v: string) => fmt(v, "d MMM", tz)}
            minTickGap={24}
          />
          <YAxis {...AXIS} tick={TICK} width={36} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--surface-inset)" }}
            content={
              <ChartTooltip
                total
                labelFormatter={(v) => fmt(String(v), "EEE d MMM", tz)}
                formatter={(value) => value.toLocaleString()}
              />
            }
          />
          {active.map((member, i) => (
            <Bar
              key={member.id}
              dataKey={member.id}
              name={nameOf.get(member.id) ?? "Unknown"}
              stackId="dials"
              fill={colorOf.get(member.id)}
              /* 2px of surface between segments does the separating — no strokes. */
              stroke="var(--surface)"
              strokeWidth={2}
              maxBarSize={24}
              radius={i === active.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Connect rate trend — one series, so no legend; the title names it   */
/* ------------------------------------------------------------------ */

export function ConnectRateChart({ rows, tz }: { rows: DailyRow[]; tz: string }) {
  const data = React.useMemo(() => {
    const byDate = new Map<string, { date: string; dials: number; answered: number }>();
    for (const row of rows) {
      const entry = byDate.get(row.date) ?? { date: row.date, dials: 0, answered: 0 };
      entry.dials += row.dials;
      entry.answered += row.answered;
      byDate.set(row.date, entry);
    }
    return [...byDate.values()]
      .filter((d) => d.dials > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, rate: Math.round((d.answered / d.dials) * 100) }));
  }, [rows]);

  if (data.length === 0) {
    return (
      <ChartCard title="Connect rate" description="Answered calls as a share of dials.">
        <EmptyState compact title="Nothing to plot yet" description="Log some calls first." />
      </ChartCard>
    );
  }

  const average = Math.round(
    (data.reduce((s, d) => s + d.answered, 0) / data.reduce((s, d) => s + d.dials, 0)) * 100,
  );

  return (
    <ChartCard
      title="Connect rate"
      description={`Answered as a share of dials. ${average}% across the range.`}
      table={
        <DataTable
          caption="Connect rate by day"
          columns={["Day", "Dials", "Answered", "Rate"]}
          rows={data.map((d) => [fmt(d.date, "d MMM", tz), d.dials, d.answered, `${d.rate}%`])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis
            dataKey="date"
            {...AXIS}
            tick={TICK}
            tickFormatter={(v: string) => fmt(v, "d MMM", tz)}
            minTickGap={24}
          />
          <YAxis {...AXIS} tick={TICK} width={36} unit="%" domain={[0, "dataMax + 10"]} />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
            content={
              <ChartTooltip
                labelFormatter={(v) => fmt(String(v), "EEE d MMM", tz)}
                formatter={(value, name) => (name === "Connect rate" ? `${value}%` : value.toLocaleString())}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="rate"
            name="Connect rate"
            stroke={SERIES_COLORS[0]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Best calling hours — the metric is connect rate, not volume         */
/* ------------------------------------------------------------------ */

export function CallingHoursChart({
  rows,
}: {
  rows: Array<{ hour: number; dials: number; answered: number }>;
}) {
  const data = React.useMemo(
    () =>
      rows
        .filter((r) => r.dials > 0)
        .map((r) => ({ ...r, rate: Math.round((r.answered / r.dials) * 100) }))
        .sort((a, b) => a.hour - b.hour),
    [rows],
  );

  if (data.length === 0) {
    return (
      <ChartCard title="Best hours to call" description="Connect rate by hour of day.">
        <EmptyState compact title="Not enough calls yet" description="This fills in as the team dials." />
      </ChartCard>
    );
  }

  /* The peak is the one bar worth labelling — but only where the sample is big
     enough that a rate means something. */
  const credible = data.filter((d) => d.dials >= 5);
  const peak = (credible.length > 0 ? credible : data).reduce((a, b) => (b.rate > a.rate ? b : a));

  return (
    <ChartCard
      title="Best hours to call"
      description={`Connect rate by hour. Best so far is ${label(peak.hour)} at ${peak.rate}%.`}
      table={
        <DataTable
          caption="Connect rate by hour of day"
          columns={["Hour", "Dials", "Answered", "Rate"]}
          rows={data.map((d) => [label(d.hour), d.dials, d.answered, `${d.rate}%`])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="hour" {...AXIS} tick={TICK} tickFormatter={label} minTickGap={12} />
          <YAxis {...AXIS} tick={TICK} width={36} unit="%" />
          <Tooltip
            cursor={{ fill: "var(--surface-inset)" }}
            content={
              <ChartTooltip
                labelFormatter={(v) => label(Number(v))}
                formatter={(value, name) => (name === "Connect rate" ? `${value}%` : value.toLocaleString())}
              />
            }
          />
          <Bar dataKey="rate" name="Connect rate" maxBarSize={24} radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              /* One hue for the series; the peak lifts to full strength so the
                 answer is findable without adding a second colour meaning. */
              <Cell
                key={entry.hour}
                fill={SERIES_COLORS[0]}
                fillOpacity={entry.hour === peak.hour ? 1 : 0.45}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function label(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/* ------------------------------------------------------------------ */
/* Source batch quality                                                */
/* ------------------------------------------------------------------ */

export function BatchQualityChart({
  rows,
}: {
  rows: Array<{
    batchId: string | null;
    filename: string;
    total: number;
    connected: number;
    interested: number;
    converted: number;
    wrongNumber: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <ChartCard title="Which scrapes are worth repeating" description="Lead quality by source sheet.">
        <EmptyState
          compact
          title="No imported batches yet"
          description="Import a sheet and its quality shows up here."
        />
      </ChartCard>
    );
  }

  const data = rows
    .map((r) => ({
      ...r,
      short: r.filename.replace(/\.(csv|xlsx|xls|tsv)$/i, "").slice(0, 22),
      interestedRate: Math.round((r.interested / r.total) * 100),
      badRate: Math.round((r.wrongNumber / r.total) * 100),
    }))
    .sort((a, b) => b.interestedRate - a.interestedRate)
    .slice(0, 8);

  return (
    <ChartCard
      title="Which scrapes are worth repeating"
      description="Interested leads as a share of the sheet, against its dud numbers. All time."
      height={Math.max(200, data.length * 34)}
      legend={
        <ChartLegend
          items={[
            { label: "Interested", color: SERIES_COLORS[1]! },
            { label: "Wrong number", color: TONE_HEX.danger },
          ]}
        />
      }
      table={
        <DataTable
          caption="Lead quality by source sheet"
          columns={["Sheet", "Leads", "Interested", "Converted", "Wrong number"]}
          rows={data.map((d) => [d.filename, d.total, `${d.interestedRate}%`, d.converted, `${d.badRate}%`])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid {...GRID} horizontal={false} vertical />
          <XAxis type="number" {...AXIS} tick={TICK} unit="%" />
          <YAxis type="category" dataKey="short" {...AXIS} tick={TICK} width={130} />
          <Tooltip
            cursor={{ fill: "var(--surface-inset)" }}
            content={<ChartTooltip formatter={(value) => `${value}%`} />}
          />
          <Bar
            dataKey="interestedRate"
            name="Interested"
            fill={SERIES_COLORS[1]}
            maxBarSize={20}
            radius={[0, 4, 4, 0]}
            stroke="var(--surface)"
            strokeWidth={2}
          />
          <Bar
            dataKey="badRate"
            name="Wrong number"
            fill={TONE_HEX.danger}
            maxBarSize={20}
            radius={[0, 4, 4, 0]}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Lost reasons                                                        */
/* ------------------------------------------------------------------ */

export function LostReasonsChart({ rows }: { rows: Array<{ reason: string | null; n: number }> }) {
  const data = rows
    .filter((r) => r.reason)
    .map((r) => ({
      name: LOST_REASON[r.reason as keyof typeof LOST_REASON] ?? r.reason!,
      value: r.n,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  if (data.length === 0) {
    return (
      <ChartCard title="Why deals are lost" description="Across every closed lead.">
        <EmptyState compact title="Nothing lost yet" description="Reasons appear as leads are closed out." />
      </ChartCard>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <ChartCard
      title="Why deals are lost"
      description={`${total.toLocaleString()} closed leads with a reason recorded. All time.`}
      table={
        <DataTable
          caption="Lost reasons"
          columns={["Reason", "Leads", "Share"]}
          rows={data.map((d) => [d.name, d.value, pct(d.value, total)])}
        />
      }
    >
      <div className="flex h-full items-center gap-2">
        <div className="h-full min-w-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="88%"
                paddingAngle={2}
                stroke="var(--surface)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((entry, i) => (
                  <Cell key={entry.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                content={<ChartTooltip formatter={(value) => `${value.toLocaleString()} (${pct(value, total)})`} />}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-[46%] shrink-0 space-y-1.5 pr-3">
          {data.map((entry, i) => (
            <li key={entry.name} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{entry.name}</span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-strong">
                {pct(entry.value, total)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
