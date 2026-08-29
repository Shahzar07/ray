"use client";

import * as React from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shared chart chrome. Every chart in the app is wrapped in this so they read
 * as one system: same header, same recessive axes, same tooltip, and — the part
 * that matters for accessibility — the same table view.
 *
 * The table is not a nicety. Two colours in the palette sit under a 3:1 contrast
 * ratio against the surface, and slots 6 and 7 are close under deuteranopia, so
 * every value has to be reachable without relying on hue. The toggle is that
 * guarantee, and it doubles as the "let me read the actual numbers" affordance
 * people ask for anyway.
 */

export const AXIS = {
  stroke: "var(--line-strong)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID = {
  stroke: "var(--line)",
  strokeWidth: 1,
  vertical: false,
} as const;

export const TICK = { fill: "var(--text-subtle)", fontSize: 11 } as const;

export function ChartCard({
  title,
  description,
  actions,
  table,
  legend,
  children,
  className,
  height = 260,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** The WCAG-clean twin. Rendered instead of the chart when the reader asks. */
  table?: React.ReactNode;
  /** Sits below the plot, outside its fixed height, so it is never clipped. */
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const [view, setView] = React.useState<"chart" | "table">("chart");

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {table && (
            <div className="flex gap-0.5 rounded-lg bg-inset p-0.5" role="group" aria-label={`${title} view`}>
              <ViewButton active={view === "chart"} onClick={() => setView("chart")} label="Chart">
                <BarChart3 className="size-3.5" />
              </ViewButton>
              <ViewButton active={view === "table"} onClick={() => setView("table")} label="Table">
                <Table2 className="size-3.5" />
              </ViewButton>
            </div>
          )}
        </div>
      </CardHeader>

      <div className="px-2 pb-4 pl-1">
        {view === "chart" ? (
          <>
            <div style={{ height }} className="w-full">
              {children}
            </div>
            {legend}
          </>
        ) : (
          <div className="max-h-[320px] overflow-auto px-4">{table}</div>
        )}
      </div>
    </Card>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${label} view`}
      className={cn(
        "grid size-6 place-items-center rounded-md transition-colors",
        active ? "bg-surface text-strong shadow-xs" : "text-subtle hover:text-strong",
      )}
    >
      {children}
      <span className="sr-only">{label} view</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

type TooltipEntry = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number };

/**
 * One tooltip listing every series at that x. Values lead, series names follow,
 * and each row is keyed by a short stroke rather than a filled box.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  total,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string | number) => string;
  total?: boolean;
}) {
  if (!active || !payload?.length) return null;

  const rows = payload.filter((p) => p.value !== undefined && p.value !== null);
  const sum = rows.reduce((acc, r) => acc + (typeof r.value === "number" ? r.value : 0), 0);

  return (
    <div className="pointer-events-none min-w-[150px] rounded-lg border border-line bg-surface px-2.5 py-2 shadow-lg">
      {label !== undefined && (
        <p className="mb-1.5 text-[11.5px] font-medium text-muted">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <ul className="space-y-1">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-[2px] w-3 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
              <span className="truncate text-[12px] text-muted">{String(row.name ?? row.dataKey ?? "")}</span>
            </span>
            <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-strong">
              {formatter && typeof row.value === "number"
                ? formatter(row.value, String(row.name ?? ""))
                : String(row.value)}
            </span>
          </li>
        ))}
      </ul>
      {total && rows.length > 1 && (
        <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-line pt-1.5">
          <span className="text-[12px] text-muted">Total</span>
          <span className="text-[12.5px] font-semibold tabular-nums text-strong">{sum.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Legend                                                              */
/* ------------------------------------------------------------------ */

/** Always present for two or more series — identity is never colour alone. */
export function ChartLegend({
  items,
  shape = "rect",
  className,
}: {
  items: Array<{ label: string; color: string }>;
  shape?: "rect" | "line";
  className?: string;
}) {
  if (items.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 pt-1", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className={cn("shrink-0", shape === "line" ? "h-[2px] w-3.5 rounded-full" : "size-2.5 rounded-[3px]")}
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="text-[11.5px] text-muted">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Table twin                                                          */
/* ------------------------------------------------------------------ */

export function DataTable({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
  caption?: string;
}) {
  return (
    <table className="w-full border-collapse text-[12.5px]">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead className="sticky top-0 bg-surface">
        <tr className="border-b border-line text-left">
          {columns.map((column, i) => (
            <th
              key={column}
              scope="col"
              className={cn(
                "py-1.5 pr-3 text-[11px] font-semibold uppercase tracking-wider text-subtle",
                i > 0 && "text-right",
              )}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--line)]">
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td
                key={c}
                className={cn(
                  "py-1.5 pr-3",
                  c === 0 ? "text-body" : "text-right font-medium tabular-nums text-strong",
                )}
              >
                {typeof cell === "number" ? cell.toLocaleString() : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
