"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarClock, Ban, Tag, UserRound, X, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/controls";
import { StatusBadge } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { bulkUpdate } from "@/lib/actions/leads";
import { LEAD_STATUS } from "@/lib/domain/constants";
import { plural } from "@/lib/utils";
import type { LeadStatus } from "@/lib/db/schema";
import type { Member } from "./inline-cells";

/** Floating action bar — appears only when rows are selected. */
export function BulkBar({
  selected,
  members,
  canManage,
  onClear,
}: {
  selected: Set<string>;
  members: Member[];
  canManage: boolean;
  onClear: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [tagValue, setTagValue] = React.useState("");
  const ids = React.useMemo(() => [...selected], [selected]);

  if (ids.length === 0) return null;

  function run(payload: Record<string, unknown>, label: string) {
    startTransition(async () => {
      const result = await bulkUpdate({ leadIds: ids, ...payload });
      if (result.ok) {
        toast({
          title: label,
          description: `${result.data?.affected ?? ids.length} ${plural(result.data?.affected ?? ids.length, "lead")} updated.`,
          tone: "success",
        });
        onClear();
        router.refresh();
      } else {
        toast({ title: "Nothing changed", description: result.error, tone: "danger" });
      }
    });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-6">
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
        <span className="ml-2 mr-1 shrink-0 text-[12.5px] font-medium tabular-nums text-strong">
          {ids.length} selected
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              <CircleDot />
              Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="max-h-[300px] overflow-y-auto">
            <DropdownMenuLabel>Set status</DropdownMenuLabel>
            {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onSelect={() => run({ action: "status", status: key }, `Status → ${LEAD_STATUS[key].label}`)}
              >
                <StatusBadge status={key} size="xs" />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={pending}>
                <UserRound />
                Assign
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center">
              <DropdownMenuLabel>Assign to</DropdownMenuLabel>
              {members.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => run({ action: "assign", assignedTo: m.id }, `Assigned to ${m.name}`)}
                >
                  <Avatar name={m.name} src={m.avatarUrl} size="xs" />
                  {m.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => run({ action: "assign", assignedTo: null }, "Unassigned")}>
                <X />
                Unassign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              <Tag />
              Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-[230px] p-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tagValue.trim()) {
                  run({ action: "tag", tag: tagValue.trim() }, `Tagged “${tagValue.trim()}”`);
                  setTagValue("");
                }
              }}
              className="flex gap-1.5"
            >
              <Input
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder="tag name"
                className="h-8"
                autoFocus
              />
              <Button type="submit" variant="primary" size="sm">
                Add
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              <CalendarClock />
              Follow-up
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-[190px] p-2">
            <div className="space-y-0.5">
              {([["Today", 0], ["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7]] as Array<[string, number]>).map(
                ([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + days);
                      d.setHours(10, 0, 0, 0);
                      run({ action: "follow_up", nextFollowUpAt: d.toISOString() }, `Follow-up set — ${label}`);
                    }}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-body transition-colors hover:bg-inset"
                  >
                    {label}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => run({ action: "follow_up", nextFollowUpAt: null }, "Follow-up cleared")}
                className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-inset"
              >
                Clear
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run({ action: "archive" }, "Archived")}>
          <Archive />
          Archive
        </Button>

        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            className="text-danger-text hover:bg-danger-soft"
            onClick={() => run({ action: "dnc" }, "Added to Do Not Call")}
          >
            <Ban />
            DNC
          </Button>
        )}

        <span className="mx-1 h-5 w-px shrink-0 bg-line" />
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
          <X />
        </Button>
      </div>
    </div>
  );
}
