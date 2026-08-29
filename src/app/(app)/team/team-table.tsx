"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/controls";
import { RoleBadge } from "@/components/ui/display";
import { Badge } from "@/components/ui/badge";
import { relative } from "@/lib/domain/dates";
import { cn, pct } from "@/lib/utils";
import type { Role } from "@/lib/db/schema";

export type TeamRow = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  dials: number;
  answered: number;
  interested: number;
  demosScheduled: number;
  trialsStarted: number;
  converted: number;
  openLeads: number;
  overdue: number;
  attemptsToConnect: number | null;
  lastActiveAt: string | null;
};

type SortKey =
  | "name"
  | "dials"
  | "answered"
  | "connectRate"
  | "interested"
  | "demosScheduled"
  | "trialsStarted"
  | "converted"
  | "conversionRate"
  | "attemptsToConnect"
  | "overdue";

const COLUMNS: Array<{ key: SortKey; label: string; hint?: string; hideBelow?: string }> = [
  { key: "name", label: "Member" },
  { key: "dials", label: "Dials" },
  { key: "answered", label: "Answered" },
  { key: "connectRate", label: "Connect", hint: "Answered as a share of dials" },
  { key: "interested", label: "Interested", hideBelow: "sm" },
  { key: "demosScheduled", label: "Demos", hideBelow: "md" },
  { key: "trialsStarted", label: "Trials", hideBelow: "md" },
  { key: "converted", label: "Won" },
  { key: "conversionRate", label: "Win rate", hint: "Converted as a share of trials started" },
  { key: "attemptsToConnect", label: "Dials/connect", hint: "Average attempts before someone picks up", hideBelow: "lg" },
  { key: "overdue", label: "Overdue", hint: "Follow-ups past their date" },
];

function valueOf(row: TeamRow, key: SortKey): number | string {
  switch (key) {
    case "name":
      return (row.name ?? "").toLowerCase();
    case "connectRate":
      return row.dials ? row.answered / row.dials : -1;
    case "conversionRate":
      return row.trialsStarted ? row.converted / row.trialsStarted : -1;
    case "attemptsToConnect":
      return row.attemptsToConnect ?? Number.POSITIVE_INFINITY;
    default:
      return row[key];
  }
}

export function TeamTable({ rows, rangeLabel }: { rows: TeamRow[]; rangeLabel: string }) {
  const [sort, setSort] = React.useState<SortKey>("converted");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");

  const sorted = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = valueOf(a, sort);
      const bv = valueOf(b, sort);
      const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, dir]);

  function toggle(key: SortKey) {
    if (key === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Every caller</CardTitle>
          <CardDescription>
            Activity over the last {rangeLabel.toLowerCase()}; open and overdue counts are live. Click a row to work
            that person&rsquo;s leads.
          </CardDescription>
        </div>
      </CardHeader>

      <div className="overflow-x-auto border-t border-line">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-sunken">
              {COLUMNS.map((column) => {
                const active = sort === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    title={column.hint}
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "whitespace-nowrap p-0 text-[11px] font-semibold uppercase tracking-wider",
                      column.key === "name" ? "text-left" : "text-right",
                      column.hideBelow === "sm" && "hidden sm:table-cell",
                      column.hideBelow === "md" && "hidden md:table-cell",
                      column.hideBelow === "lg" && "hidden lg:table-cell",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      className={cn(
                        "inline-flex w-full items-center gap-1 py-2 transition-colors hover:text-strong",
                        column.key === "name" ? "justify-start pl-5 pr-3" : "justify-end pr-3",
                        column.key === "overdue" && "pr-5",
                        active ? "text-strong" : "text-subtle",
                      )}
                    >
                      {column.label}
                      {active ? (
                        dir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {sorted.map((row) => (
              <tr key={row.userId} className="group hover:bg-inset">
                <td className="py-2.5 pl-5 pr-3">
                  <Link href={`/leads?assignee=${row.userId}`} className="flex items-center gap-2">
                    <Avatar name={row.name} src={row.avatarUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-strong group-hover:text-accent-text">
                          {row.name ?? "Unknown"}
                        </span>
                        <ExternalLink className="size-3 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      <span className="flex items-center gap-1.5 text-[11.5px] text-subtle">
                        <RoleBadge role={row.role} size="xs" />
                        {row.lastActiveAt ? `active ${relative(row.lastActiveAt)}` : "never called"}
                      </span>
                    </span>
                  </Link>
                </td>
                <Num value={row.dials} />
                <Num value={row.answered} />
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{pct(row.answered, row.dials)}</td>
                <Num value={row.interested} className="hidden sm:table-cell" />
                <Num value={row.demosScheduled} className="hidden md:table-cell" />
                <Num value={row.trialsStarted} className="hidden md:table-cell" />
                <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-strong">
                  {row.converted.toLocaleString()}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted">
                  {pct(row.converted, row.trialsStarted)}
                </td>
                <td className="hidden py-2.5 pr-3 text-right tabular-nums text-muted lg:table-cell">
                  {row.attemptsToConnect ? row.attemptsToConnect.toFixed(1) : "—"}
                </td>
                <td className="py-2.5 pr-5 text-right">
                  {row.overdue > 0 ? (
                    <Link href={`/leads?assignee=${row.userId}&view=overdue`}>
                      <Badge tone="danger" size="xs" className="tabular-nums">
                        {row.overdue}
                      </Badge>
                    </Link>
                  ) : (
                    <span className="text-[12px] text-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Num({ value, className }: { value: number; className?: string }) {
  return (
    <td className={cn("py-2.5 pr-3 text-right tabular-nums text-body", className)}>{value.toLocaleString()}</td>
  );
}
