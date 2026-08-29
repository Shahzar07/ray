"use client";

import * as React from "react";
import { CalendarClock, Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateLead } from "@/lib/actions/leads";
import { useToast } from "@/components/ui/toast";
import { StatusBadge, InterestBadge } from "@/components/ui/display";
import { Avatar } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/overlays";
import { INTEREST_LEVEL, LEAD_STATUS } from "@/lib/domain/constants";
import { fmtDate, isOverdue, relative } from "@/lib/domain/dates";
import type { InterestLevel, LeadStatus } from "@/lib/db/schema";

export type Member = { id: string; name: string | null; avatarUrl: string | null };

/**
 * All four inline editors share the same shape: paint the new value straight
 * away, fire the action, and roll back with a toast if the server says no.
 * One click, no modal — that is the whole point of the leads table.
 */
function useInlineUpdate<T>(leadId: string, field: string, initial: T) {
  const { toast } = useToast();
  const [value, setValue] = React.useState<T>(initial);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => setValue(initial), [initial]);

  const commit = React.useCallback(
    (next: T, label?: string) => {
      const previous = value;
      setValue(next);
      startTransition(async () => {
        const result = await updateLead({ leadId, [field]: next });
        if (!result.ok) {
          setValue(previous);
          toast({ title: "Not saved", description: result.error, tone: "danger" });
        } else if (label) {
          toast({
            title: label,
            tone: "success",
            action: {
              label: "Undo",
              onClick: async () => {
                setValue(previous);
                await updateLead({ leadId, [field]: previous });
              },
            },
          });
        }
      });
    },
    [field, leadId, toast, value],
  );

  return { value, commit, pending };
}

const triggerCls =
  "group/cell -mx-1.5 flex h-7 w-full items-center gap-1 rounded-md px-1.5 text-left transition-colors hover:bg-inset data-[state=open]:bg-inset";

export function StatusCell({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const { value, commit, pending } = useInlineUpdate<LeadStatus>(leadId, "status", status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerCls, pending && "opacity-60")} aria-label="Change status">
        <StatusBadge status={value} short size="xs" />
        <ChevronDown className="size-3 shrink-0 text-subtle opacity-0 transition-opacity group-hover/cell:opacity-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[190px]">
        <DropdownMenuLabel>Set status</DropdownMenuLabel>
        {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((key) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => key !== value && commit(key, `Status → ${LEAD_STATUS[key].label}`)}
          >
            <StatusBadge status={key} size="xs" />
            {key === value && <Check className="ml-auto size-3.5 text-accent" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InterestCell({ leadId, level }: { leadId: string; level: InterestLevel | null }) {
  const { value, commit, pending } = useInlineUpdate<InterestLevel | null>(leadId, "interestLevel", level);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerCls, pending && "opacity-60")} aria-label="Change interest level">
        <InterestBadge level={value} size="xs" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[150px]">
        <DropdownMenuLabel>Interest</DropdownMenuLabel>
        {(Object.keys(INTEREST_LEVEL) as InterestLevel[]).map((key) => (
          <DropdownMenuItem key={key} onSelect={() => commit(key, `Interest → ${INTEREST_LEVEL[key].label}`)}>
            <InterestBadge level={key} size="xs" />
            {key === value && <Check className="ml-auto size-3.5 text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => commit(null)}>
          <X />
          Clear
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AssigneeCell({
  leadId,
  assignedTo,
  assigneeName,
  members,
  canReassign,
}: {
  leadId: string;
  assignedTo: string | null;
  assigneeName: string | null;
  members: Member[];
  canReassign: boolean;
}) {
  const { value, commit, pending } = useInlineUpdate<string | null>(leadId, "assignedTo", assignedTo);
  const current = members.find((m) => m.id === value);
  const name = current?.name ?? (value === assignedTo ? assigneeName : null);

  const body = name ? (
    <>
      <Avatar name={name} src={current?.avatarUrl} size="xs" />
      <span className="truncate text-[12.5px] text-body">{name}</span>
    </>
  ) : (
    <span className="text-[12.5px] text-subtle">Unassigned</span>
  );

  if (!canReassign) return <span className="flex items-center gap-1.5">{body}</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerCls, pending && "opacity-60")} aria-label="Reassign lead">
        {body}
        <ChevronDown className="ml-auto size-3 shrink-0 text-subtle opacity-0 transition-opacity group-hover/cell:opacity-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => commit(m.id, `Assigned to ${m.name}`)}>
            <Avatar name={m.name} src={m.avatarUrl} size="xs" />
            <span className="truncate">{m.name}</span>
            {m.id === value && <Check className="ml-auto size-3.5 text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => commit(null, "Unassigned")}>
          <X />
          Unassign
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const QUICK_DATES: Array<[string, number]> = [
  ["Today", 0],
  ["Tomorrow", 1],
  ["In 3 days", 3],
  ["Next week", 7],
  ["In 2 weeks", 14],
];

export function FollowUpCell({
  leadId,
  date,
  tz,
}: {
  leadId: string;
  date: Date | string | null;
  tz: string;
}) {
  const { value, commit, pending } = useInlineUpdate<string | null>(
    leadId,
    "nextFollowUpAt",
    date ? new Date(date).toISOString() : null,
  );
  const [open, setOpen] = React.useState(false);
  const overdue = value ? isOverdue(value) : false;

  function set(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    commit(d.toISOString(), `Follow-up ${days === 0 ? "today" : `in ${days}d`}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(triggerCls, pending && "opacity-60")} aria-label="Set follow-up date">
        {value ? (
          <span
            className={cn(
              "flex items-center gap-1.5 text-[12.5px] tabular-nums",
              overdue ? "font-medium text-danger-text" : "text-body",
            )}
          >
            {overdue && <span className="size-1.5 rounded-full bg-danger" aria-hidden />}
            {fmtDate(value, tz)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[12.5px] text-subtle">
            <CalendarClock className="size-3.5 opacity-0 transition-opacity group-hover/cell:opacity-100" />
            Set
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-2">
        <div className="px-1.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
          Follow up
        </div>
        <div className="space-y-0.5">
          {QUICK_DATES.map(([label, days]) => (
            <button
              key={label}
              type="button"
              onClick={() => set(days)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-body transition-colors hover:bg-inset"
            >
              {label}
              <span className="text-[11.5px] tabular-nums text-subtle">
                {fmtDate(new Date(Date.now() + days * 86_400_000), tz)}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 space-y-1.5 border-t border-line pt-2">
          <Input
            type="date"
            className="h-8"
            defaultValue={value ? new Date(value).toISOString().slice(0, 10) : ""}
            onChange={(e) => {
              if (!e.target.value) return;
              const d = new Date(`${e.target.value}T10:00:00`);
              commit(d.toISOString(), "Follow-up set");
              setOpen(false);
            }}
          />
          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                commit(null, "Follow-up cleared");
                setOpen(false);
              }}
            >
              <X />
              Clear follow-up
            </Button>
          )}
        </div>
        {value && (
          <p className="px-1.5 pt-2 text-[11px] text-subtle">
            {overdue ? "Overdue " : "Due "}
            {relative(value)}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ScoreCell({ score }: { score: number }) {
  const tone = score >= 70 ? "bg-success" : score >= 45 ? "bg-warning" : "bg-line-strong";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1 w-8 overflow-hidden rounded-full bg-inset">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </span>
      <span className="text-[12px] tabular-nums text-muted">{score}</span>
    </span>
  );
}
