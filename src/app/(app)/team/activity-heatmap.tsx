"use client";

import * as React from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { cn } from "@/lib/utils";

export type HeatCell = { weekday: number; hour: number; dials: number; answered: number };

/* Postgres `extract(dow ...)` is 0 = Sunday. The working week reads better
   Monday-first, so the rows are ordered, not renumbered. */
const DAYS = [
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
  { dow: 0, label: "Sun" },
];

function hourLabel(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/**
 * Two grids side by side answer the question the brief actually asks: when does
 * the team call, and when do people actually pick up? Reading them together is
 * the point — a dark column on the left with nothing beside it on the right is
 * an hour being wasted.
 *
 * Both are sequential: one hue, light to dark. Never a rainbow on a magnitude.
 */
export function ActivityHeatmap({ cells }: { cells: HeatCell[] }) {
  const { hours, byKey, maxDials, maxRate } = React.useMemo(() => {
    const map = new Map<string, HeatCell>();
    let maxD = 0;
    let maxR = 0;
    const hourSet = new Set<number>();

    for (const cell of cells) {
      map.set(`${cell.weekday}:${cell.hour}`, cell);
      hourSet.add(cell.hour);
      maxD = Math.max(maxD, cell.dials);
      if (cell.dials >= 3) maxR = Math.max(maxR, cell.answered / cell.dials);
    }

    const list = [...hourSet].sort((a, b) => a - b);
    const from = list[0] ?? 9;
    const to = list[list.length - 1] ?? 18;
    return {
      hours: Array.from({ length: to - from + 1 }, (_, i) => from + i),
      byKey: map,
      maxDials: maxD,
      maxRate: maxR || 1,
    };
  }, [cells]);

  if (cells.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>When the team calls</CardTitle>
            <CardDescription>Hour by weekday.</CardDescription>
          </div>
        </CardHeader>
        <div className="p-5 pt-0">
          <EmptyState compact title="No calls logged yet" description="This fills in as the team works the phones." />
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Grid
        title="When the team calls"
        description="Dial volume by hour and weekday, over the range."
        hours={hours}
        byKey={byKey}
        intensity={(cell) => (maxDials ? cell.dials / maxDials : 0)}
        readout={(cell) => `${cell.dials} ${cell.dials === 1 ? "dial" : "dials"}`}
        scaleLabel={["quiet", `${maxDials} dials`]}
      />
      <Grid
        title="When people actually answer"
        description="Connect rate by hour and weekday. Cells with under 3 dials are left blank — a rate needs a sample."
        hours={hours}
        byKey={byKey}
        intensity={(cell) => (cell.dials >= 3 ? cell.answered / cell.dials / maxRate : null)}
        readout={(cell) =>
          cell.dials >= 3
            ? `${Math.round((cell.answered / cell.dials) * 100)}% of ${cell.dials}`
            : `only ${cell.dials} ${cell.dials === 1 ? "dial" : "dials"}`
        }
        scaleLabel={["low", `${Math.round(maxRate * 100)}%`]}
      />
    </div>
  );
}

function Grid({
  title,
  description,
  hours,
  byKey,
  intensity,
  readout,
  scaleLabel,
}: {
  title: string;
  description: string;
  hours: number[];
  byKey: Map<string, HeatCell>;
  /** 0–1, or null for "not enough data to colour this in". */
  intensity: (cell: HeatCell) => number | null;
  readout: (cell: HeatCell) => string;
  scaleLabel: [string, string];
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-0.5">{description}</CardDescription>
        </div>
      </CardHeader>

      <div className="overflow-x-auto px-5 pb-4">
        <table className="border-separate border-spacing-[2px] text-[11px]">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-8">
                <span className="sr-only">Weekday</span>
              </th>
              {hours.map((hour) => (
                <th key={hour} scope="col" className="pb-1 font-medium text-subtle">
                  <span className={cn(hour % 2 === 0 ? "" : "invisible")}>{hourLabel(hour)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day.dow}>
                <th scope="row" className="pr-1.5 text-right font-medium text-subtle">
                  {day.label}
                </th>
                {hours.map((hour) => {
                  const cell = byKey.get(`${day.dow}:${hour}`);
                  const level = cell ? intensity(cell) : null;
                  return (
                    <td key={hour} className="p-0">
                      <div
                        title={
                          cell
                            ? `${day.label} ${hourLabel(hour)} — ${readout(cell)}`
                            : `${day.label} ${hourLabel(hour)} — no calls`
                        }
                        className="size-5 rounded-[3px] bg-inset ring-1 ring-inset ring-line/60"
                        style={{
                          /* Mixed with `transparent`, not with the surface: the
                             surface has no hue, and OKLCH would interpolate
                             toward it and swing the accent into magenta. This
                             just varies alpha over the card, one hue throughout. */
                          backgroundColor:
                            level === null || level === 0
                              ? undefined
                              : `color-mix(in oklch, var(--accent) ${Math.round(12 + level * 88)}%, transparent)`,
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex items-center gap-2 text-[11px] text-subtle">
          <span>{scaleLabel[0]}</span>
          <div className="flex gap-[2px]">
            {[0.12, 0.34, 0.56, 0.78, 1].map((step) => (
              <span
                key={step}
                className="size-3 rounded-[2px] ring-1 ring-inset ring-line/60"
                style={{
                  backgroundColor: `color-mix(in oklch, var(--accent) ${Math.round(step * 100)}%, transparent)`,
                }}
                aria-hidden
              />
            ))}
          </div>
          <span>{scaleLabel[1]}</span>
        </div>
      </div>
    </Card>
  );
}
