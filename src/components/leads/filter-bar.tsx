"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Columns3,
  Download,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { INTEREST_LEVEL, LEAD_STATUS, TRIAL_STATUS } from "@/lib/domain/constants";
import { PRESETS, type PresetKey } from "@/lib/domain/views";
import type { InterestLevel, LeadStatus, TrialStatus } from "@/lib/db/schema";
import type { Member } from "./inline-cells";

export type ColumnKey =
  | "company"
  | "jobTitle"
  | "phone"
  | "email"
  | "city"
  | "status"
  | "interest"
  | "score"
  | "attempts"
  | "followUp"
  | "trial"
  | "assignee"
  | "tags"
  | "updated";

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  company: "Company",
  jobTitle: "Title",
  phone: "Phone",
  email: "Email",
  city: "City",
  status: "Status",
  interest: "Interest",
  score: "Score",
  attempts: "Dials",
  followUp: "Follow-up",
  trial: "Trial",
  assignee: "Owner",
  tags: "Tags",
  updated: "Updated",
};

export const DEFAULT_COLUMNS: ColumnKey[] = [
  "company",
  "phone",
  "status",
  "interest",
  "attempts",
  "followUp",
  "assignee",
];

/** URL is the single source of truth for filters, so views are shareable. */
export function useLeadFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = React.useCallback(
    (patch: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key);
        if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
        else if (value) next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const toggle = React.useCallback(
    (key: string, value: string) => {
      const current = params.getAll(key);
      set({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
    },
    [params, set],
  );

  return { params, set, toggle };
}

function MultiSelect<T extends string>({
  label,
  icon,
  options,
  selected,
  onToggle,
  onClear,
  render,
}: {
  label: string;
  icon?: React.ReactNode;
  options: T[];
  selected: string[];
  onToggle: (value: T) => void;
  onClear: () => void;
  render: (value: T) => React.ReactNode;
}) {
  const active = selected.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={active ? "subtle" : "secondary"} size="sm" className={cn(active && "border-accent-soft-line")}>
          {icon}
          {label}
          {active && (
            <Badge tone="accent" size="xs" className="ml-0.5">
              {selected.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[340px] w-[210px] overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={selected.includes(option)}
            onSelect={(e) => {
              e.preventDefault();
              onToggle(option);
            }}
          >
            {render(option)}
            {selected.includes(option) && <Check className="ml-auto size-3.5 text-accent" />}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClear}>
              <X />
              Clear
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterBar({
  members,
  tags,
  columns,
  onColumnsChange,
  total,
  onNewLead,
  canManage,
  canExport,
}: {
  members: Member[];
  tags: string[];
  columns: ColumnKey[];
  onColumnsChange: (next: ColumnKey[]) => void;
  total: number;
  onNewLead: () => void;
  canManage: boolean;
  /** The route 403s without it, so do not offer the button. */
  canExport: boolean;
}) {
  const { params, set, toggle } = useLeadFilters();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [search, setSearch] = React.useState(params.get("q") ?? "");

  const preset = params.get("view") as PresetKey | null;
  const statuses = params.getAll("status");
  const interests = params.getAll("interest");
  const assignees = params.getAll("assignee");
  const trials = params.getAll("trial");
  const tagFilter = params.getAll("tag");

  const activeCount =
    statuses.length + interests.length + assignees.length + trials.length + tagFilter.length + (preset ? 1 : 0);

  /* `/` focuses search, the way every keyboard-first tool does it. */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) set({ q: search || null });
    }, 260);
    return () => clearTimeout(timer);
  }, [search, params, set]);

  const exportHref = `/api/export?${params.toString()}`;

  return (
    <div className="space-y-2.5 px-4 pb-3 sm:px-6">
      {/* Saved views */}
      <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
        <button
          type="button"
          onClick={() => set({ view: null })}
          className={cn(
            "h-7 shrink-0 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors",
            !preset ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-inset hover:text-strong",
          )}
        >
          All leads
        </button>
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
          <button
            key={key}
            type="button"
            title={PRESETS[key].description}
            onClick={() => set({ view: preset === key ? null : key })}
            className={cn(
              "h-7 shrink-0 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors",
              preset === key ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-inset hover:text-strong",
            )}
          >
            {PRESETS[key].label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[190px] flex-1 sm:max-w-[300px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, company, phone, email"
            className="h-8 pl-8 pr-8 text-[13px]"
            aria-label="Search leads"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-strong"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
          )}
        </div>

        <MultiSelect
          label="Status"
          icon={<Filter />}
          options={Object.keys(LEAD_STATUS) as LeadStatus[]}
          selected={statuses}
          onToggle={(v) => toggle("status", v)}
          onClear={() => set({ status: null })}
          render={(v) => <span className="truncate">{LEAD_STATUS[v].label}</span>}
        />

        <MultiSelect
          label="Interest"
          options={Object.keys(INTEREST_LEVEL) as InterestLevel[]}
          selected={interests}
          onToggle={(v) => toggle("interest", v)}
          onClear={() => set({ interest: null })}
          render={(v) => INTEREST_LEVEL[v].label}
        />

        <MultiSelect
          label="Owner"
          options={["unassigned", ...members.map((m) => m.id)]}
          selected={assignees}
          onToggle={(v) => toggle("assignee", v)}
          onClear={() => set({ assignee: null })}
          render={(v) => (v === "unassigned" ? "Unassigned" : (members.find((m) => m.id === v)?.name ?? "—"))}
        />

        <MultiSelect
          label="Trial"
          options={Object.keys(TRIAL_STATUS) as TrialStatus[]}
          selected={trials}
          onToggle={(v) => toggle("trial", v)}
          onClear={() => set({ trial: null })}
          render={(v) => TRIAL_STATUS[v].label}
        />

        {tags.length > 0 && (
          <MultiSelect
            label="Tags"
            options={tags}
            selected={tagFilter}
            onToggle={(v) => toggle("tag", v)}
            onClear={() => set({ tag: null })}
            render={(v) => v}
          />
        )}

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set({ status: null, interest: null, assignee: null, trial: null, tag: null, view: null })}
          >
            <X />
            Clear all
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[12px] tabular-nums text-subtle sm:block">
            {total.toLocaleString()} {total === 1 ? "lead" : "leads"}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" aria-label="Choose columns">
                <Columns3 />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[190px]">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={columns.includes(key)}
                  onSelect={(e) => {
                    e.preventDefault();
                    onColumnsChange(
                      columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key],
                    );
                  }}
                >
                  {COLUMN_LABELS[key]}
                  {columns.includes(key) && <Check className="ml-auto size-3.5 text-accent" />}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onColumnsChange(DEFAULT_COLUMNS)}>
                <SlidersHorizontal />
                Reset to default
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canExport && (
            <Button variant="secondary" size="sm" asChild>
              <a href={exportHref} download aria-label="Export current view as CSV">
                <Download />
                <span className="hidden sm:inline">Export</span>
              </a>
            </Button>
          )}

          {canManage && (
            <Button variant="primary" size="sm" onClick={onNewLead}>
              <Plus />
              <span className="hidden sm:inline">New lead</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
