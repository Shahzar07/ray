"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Inbox,
  MessageCircle,
  PhoneCall,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState, TrialBadge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/overlays";
import { fmtDate, relative } from "@/lib/domain/dates";
import { formatPhone, telHref, whatsAppHref } from "@/lib/domain/phone";
import type { LeadRow } from "@/lib/queries/leads";
import {
  AssigneeCell,
  FollowUpCell,
  InterestCell,
  ScoreCell,
  StatusCell,
  type Member,
} from "./inline-cells";
import { COLUMN_LABELS, type ColumnKey } from "./filter-bar";

const ROW_HEIGHT = 44;

type ColumnSpec = {
  key: ColumnKey;
  width: string;
  align?: "right";
  sortKey?: string;
  cell: (lead: LeadRow, ctx: CellContext) => React.ReactNode;
};

type CellContext = { members: Member[]; canReassign: boolean; tz: string };

const COLUMNS: ColumnSpec[] = [
  {
    key: "company",
    width: "minmax(130px,1.1fr)",
    sortKey: "company",
    cell: (lead) =>
      lead.company ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <Building2 className="size-3.5 shrink-0 text-subtle" />
          <span className="truncate text-[13px] text-body">{lead.company}</span>
        </span>
      ) : (
        <span className="text-subtle">—</span>
      ),
  },
  {
    key: "jobTitle",
    width: "minmax(100px,0.8fr)",
    cell: (lead) => <span className="truncate text-[12.5px] text-muted">{lead.jobTitle ?? "—"}</span>,
  },
  {
    key: "phone",
    width: "148px",
    cell: (lead) => (
      <span className="flex items-center gap-1">
        <span className="truncate font-mono text-[12px] text-body">{formatPhone(lead.phonePrimary)}</span>
        <span className="flex opacity-0 transition-opacity group-hover/row:opacity-100">
          <Hint label="Dial on your phone">
            <a
              href={telHref(lead.phonePrimary)}
              onClick={(e) => e.stopPropagation()}
              className="grid size-6 place-items-center rounded-md text-subtle hover:bg-inset hover:text-accent-text"
              aria-label="Call"
            >
              <PhoneCall className="size-3.5" />
            </a>
          </Hint>
          <Hint label="Open WhatsApp">
            <a
              href={whatsAppHref(lead.phonePrimary)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="grid size-6 place-items-center rounded-md text-subtle hover:bg-inset hover:text-success-text"
              aria-label="WhatsApp"
            >
              <MessageCircle className="size-3.5" />
            </a>
          </Hint>
        </span>
      </span>
    ),
  },
  {
    key: "email",
    width: "minmax(140px,1fr)",
    cell: (lead) => <span className="truncate text-[12.5px] text-muted">{lead.email ?? "—"}</span>,
  },
  {
    key: "city",
    width: "100px",
    cell: (lead) => <span className="truncate text-[12.5px] text-muted">{lead.city ?? "—"}</span>,
  },
  {
    key: "status",
    width: "126px",
    sortKey: "status",
    cell: (lead) => <StatusCell leadId={lead.id} status={lead.status} />,
  },
  {
    key: "interest",
    width: "84px",
    sortKey: "interestLevel",
    cell: (lead) => <InterestCell leadId={lead.id} level={lead.interestLevel} />,
  },
  {
    key: "score",
    width: "86px",
    sortKey: "score",
    cell: (lead) => <ScoreCell score={lead.score} />,
  },
  {
    key: "attempts",
    width: "88px",
    align: "right",
    sortKey: "attemptsCount",
    cell: (lead) => (
      <span className="text-[12.5px] tabular-nums text-muted">
        {lead.attemptsCount}
        <span className="text-subtle"> / {lead.connectsCount}</span>
      </span>
    ),
  },
  {
    key: "followUp",
    width: "114px",
    sortKey: "nextFollowUpAt",
    cell: (lead, ctx) => <FollowUpCell leadId={lead.id} date={lead.nextFollowUpAt} tz={ctx.tz} />,
  },
  {
    key: "trial",
    width: "104px",
    sortKey: "trialEndsAt",
    cell: (lead) =>
      lead.trialStatus === "none" ? (
        <span className="text-[12.5px] text-subtle">—</span>
      ) : (
        <TrialBadge status={lead.trialStatus} size="xs" />
      ),
  },
  {
    key: "assignee",
    width: "134px",
    cell: (lead, ctx) => (
      <AssigneeCell
        leadId={lead.id}
        assignedTo={lead.assignedTo}
        assigneeName={lead.assigneeName}
        members={ctx.members}
        canReassign={ctx.canReassign}
      />
    ),
  },
  {
    key: "tags",
    width: "minmax(120px,0.9fr)",
    cell: (lead) =>
      lead.tags.length === 0 ? (
        <span className="text-[12.5px] text-subtle">—</span>
      ) : (
        <span className="flex gap-1 overflow-hidden">
          {lead.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} size="xs">
              {tag}
            </Badge>
          ))}
          {lead.tags.length > 2 && <Badge size="xs">+{lead.tags.length - 2}</Badge>}
        </span>
      ),
  },
  {
    key: "updated",
    width: "96px",
    sortKey: "updatedAt",
    cell: (lead) => <span className="text-[12px] text-subtle">{relative(lead.updatedAt)}</span>,
  },
];

export function LeadsTable({
  rows,
  columns,
  members,
  canReassign,
  tz,
  selected,
  onSelectedChange,
  onOpenLead,
  activeLeadId,
}: {
  rows: LeadRow[];
  columns: ColumnKey[];
  members: Member[];
  canReassign: boolean;
  tz: string;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onOpenLead: (id: string) => void;
  activeLeadId: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = React.useState(0);

  const visible = React.useMemo(
    () => COLUMNS.filter((c) => columns.includes(c.key)),
    [columns],
  );
  const ctx: CellContext = React.useMemo(() => ({ members, canReassign, tz }), [members, canReassign, tz]);

  const gridTemplate = `30px minmax(150px,1.25fr) ${visible.map((c) => c.width).join(" ")}`;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const sort = params.get("sort") ?? "updatedAt";
  const dir = params.get("dir") ?? "desc";

  function applySort(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("sort", key);
    next.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleRow(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  }

  /* j / k walk the list, Enter opens — the table is usable without a mouse. */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => {
          const next = Math.min(c + 1, rows.length - 1);
          virtualizer.scrollToIndex(next, { align: "auto" });
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => {
          const next = Math.max(c - 1, 0);
          virtualizer.scrollToIndex(next, { align: "auto" });
          return next;
        });
      } else if (e.key === "Enter") {
        const lead = rows[cursor];
        if (lead) {
          e.preventDefault();
          onOpenLead(lead.id);
        }
      } else if (e.key === "x") {
        const lead = rows[cursor];
        if (lead) {
          e.preventDefault();
          toggleRow(lead.id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cursor, virtualizer]);

  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 sm:px-6">
        <EmptyState
          icon={<Inbox />}
          title="No leads match this view"
          description="Loosen a filter, or bring a scraped sheet in from the importer to fill the queue."
          action={
            <Button variant="primary" size="sm" asChild>
              <a href="/import">
                <Sparkles />
                Import a sheet
              </a>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-4 overflow-hidden rounded-xl border border-line bg-surface sm:mx-6">
      <div ref={scrollRef} className="max-h-[calc(100dvh-16rem)] overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-2.5 border-b border-line bg-sunken px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle"
          style={{ gridTemplateColumns: gridTemplate, height: 36, minWidth: "fit-content" }}
        >
          <span className="flex items-center">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(v) => onSelectedChange(v ? new Set(rows.map((r) => r.id)) : new Set())}
              aria-label="Select all rows"
            />
          </span>
          <SortHeader label="Lead" sortKey="fullName" active={sort} dir={dir} onSort={applySort} />
          {visible.map((col) =>
            col.sortKey ? (
              <SortHeader
                key={col.key}
                label={COLUMN_LABELS[col.key]}
                sortKey={col.sortKey}
                active={sort}
                dir={dir}
                onSort={applySort}
                align={col.align}
              />
            ) : (
              <span key={col.key} className={cn("truncate", col.align === "right" && "text-right")}>
                {COLUMN_LABELS[col.key]}
              </span>
            ),
          )}
        </div>

        {/* Virtualised rows */}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth: "fit-content" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const lead = rows[virtualRow.index]!;
            const isSelected = selected.has(lead.id);
            const isActive = activeLeadId === lead.id;
            const isCursor = cursor === virtualRow.index;

            return (
              <div
                key={lead.id}
                role="row"
                tabIndex={-1}
                onClick={() => {
                  setCursor(virtualRow.index);
                  onOpenLead(lead.id);
                }}
                className={cn(
                  "group/row absolute left-0 grid cursor-pointer items-center gap-2.5 border-b border-line px-3 transition-colors",
                  isSelected ? "bg-accent-soft/50" : isActive ? "bg-inset" : "hover:bg-sunken",
                  isCursor && "ring-1 ring-inset ring-accent/40",
                )}
                style={{
                  gridTemplateColumns: gridTemplate,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: "100%",
                  minWidth: "fit-content",
                }}
              >
                <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleRow(lead.id)}
                    aria-label={`Select ${lead.fullName}`}
                  />
                </span>

                <span className="flex min-w-0 flex-col justify-center leading-tight">
                  <span className="truncate text-[13px] font-medium text-strong">{lead.fullName}</span>
                  {!columns.includes("company") && lead.company && (
                    <span className="truncate text-[11.5px] text-subtle">{lead.company}</span>
                  )}
                </span>

                {visible.map((col) => (
                  <span
                    key={col.key}
                    className={cn("flex min-w-0 items-center", col.align === "right" && "justify-end")}
                    onClick={(e) => {
                      // Inline editors own their clicks; the row must not open behind them.
                      if (["status", "interest", "followUp", "assignee", "phone"].includes(col.key)) {
                        e.stopPropagation();
                      }
                    }}
                  >
                    {col.cell(lead, ctx)}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: string;
  active: string;
  dir: string;
  onSort: (key: string) => void;
  align?: "right";
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 truncate uppercase tracking-wider transition-colors hover:text-strong",
        isActive && "text-strong",
        align === "right" && "justify-end",
      )}
    >
      {label}
      <Icon className={cn("size-3 shrink-0", isActive ? "text-accent" : "opacity-0 transition-opacity")} />
    </button>
  );
}
