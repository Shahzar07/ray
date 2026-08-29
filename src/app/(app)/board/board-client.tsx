"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Clock, GripVertical } from "lucide-react";
import { Avatar, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { InterestBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { updateLead } from "@/lib/actions/leads";
import { LEAD_STATUS, PIPELINE_ORDER, TONE_HEX } from "@/lib/domain/constants";
import { daysUntil, fmtDate, isOverdue, relative } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import type { InterestLevel, LeadStatus } from "@/lib/db/schema";

export type BoardCardData = {
  id: string;
  fullName: string;
  company: string | null;
  phonePrimary: string;
  status: LeadStatus;
  interestLevel: InterestLevel | null;
  nextFollowUpAt: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  stageSince: string;
};

export type BoardMember = { id: string; name: string | null; email: string; avatarUrl: string | null };

export function BoardClient({
  cards,
  members,
  assignee,
  tz,
  canReassign,
}: {
  cards: BoardCardData[];
  members: BoardMember[];
  assignee: string;
  tz: string;
  canReassign: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();

  /* Cards live in local state so a drop lands instantly; the server action
     reconciles behind it and a failure puts the card back. */
  const [items, setItems] = React.useState(cards);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<LeadStatus | null>(null);

  React.useEffect(() => setItems(cards), [cards]);

  const byStatus = React.useMemo(() => {
    const map = new Map<LeadStatus, BoardCardData[]>();
    for (const status of PIPELINE_ORDER) map.set(status, []);
    for (const card of items) map.get(card.status)?.push(card);
    return map;
  }, [items]);

  async function move(cardId: string, to: LeadStatus) {
    const card = items.find((c) => c.id === cardId);
    if (!card || card.status === to) return;
    const from = card.status;

    setItems((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, status: to, stageSince: new Date().toISOString() } : c)),
    );

    const result = await updateLead({ leadId: cardId, status: to });
    if (!result.ok) {
      setItems((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: from, stageSince: card.stageSince } : c)));
      toast({ title: "Could not move that lead", description: result.error, tone: "danger" });
      return;
    }

    toast({
      title: `${card.fullName} → ${LEAD_STATUS[to].label}`,
      tone: "success",
      action: {
        label: "Undo",
        onClick: async () => {
          setItems((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: from } : c)));
          const undo = await updateLead({ leadId: cardId, status: from });
          if (!undo.ok) {
            setItems((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: to } : c)));
            toast({ title: "Could not undo", description: undo.error, tone: "danger" });
          }
          router.refresh();
        },
      },
    });
    router.refresh();
  }

  function setAssignee(next: string) {
    const query = new URLSearchParams(params.toString());
    if (next === "all") query.delete("assignee");
    else query.set("assignee", next);
    const search = query.toString();
    router.replace(`/board${search ? `?${search}` : ""}`, { scroll: false });
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        title="Nothing in the pipeline"
        description="The board shows leads that are still in play. Import a sheet or start calling and cards appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={assignee || "all"} onValueChange={setAssignee}>
          <SelectTrigger size="sm" className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone you can see</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name ?? member.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[12.5px] text-muted">
          {items.length.toLocaleString()} {items.length === 1 ? "lead" : "leads"} in play · drag a card to change its
          status
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_ORDER.map((status) => {
          const column = byStatus.get(status) ?? [];
          const meta = LEAD_STATUS[status];
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain") || dragging;
                if (id) void move(id, status);
                setDragging(null);
              }}
              className={cn(
                "flex w-[248px] shrink-0 flex-col rounded-xl border bg-sunken transition-colors",
                over === status ? "border-accent bg-accent-soft" : "border-line",
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TONE_HEX[meta.tone] }}
                    aria-hidden
                  />
                  <h2 className="truncate text-[12.5px] font-semibold text-strong">{meta.label}</h2>
                </span>
                <span className="shrink-0 rounded-md bg-inset px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
                  {column.length}
                </span>
              </header>

              <div className="flex min-h-[80px] flex-col gap-2 p-2">
                {column.length === 0 ? (
                  <p className="px-1.5 py-5 text-center text-[12px] text-subtle">
                    {over === status ? "Drop here" : "Empty"}
                  </p>
                ) : (
                  column.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      tz={tz}
                      dragging={dragging === card.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", card.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(card.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      onMove={(to) => void move(card.id, to)}
                      canReassign={canReassign}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  card,
  tz,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  canReassign,
}: {
  card: BoardCardData;
  tz: string;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (to: LeadStatus) => void;
  canReassign: boolean;
}) {
  const inStage = Math.max(0, -(daysUntil(card.stageSince) ?? 0));
  const overdue = isOverdue(card.nextFollowUpAt);
  const index = PIPELINE_ORDER.indexOf(card.status);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative cursor-grab rounded-lg border bg-surface p-2.5 shadow-xs transition-all active:cursor-grabbing",
        overdue ? "border-danger/25" : "border-line",
        dragging ? "opacity-40" : "hover:border-line-strong",
      )}
    >
      <Link href={`/leads?lead=${card.id}`} className="absolute inset-0 rounded-lg">
        <span className="sr-only">Open {card.fullName}</span>
      </Link>

      <div className="flex items-start gap-2">
        <GripVertical className="mt-px size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-strong">{card.fullName}</p>
          {card.company && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-subtle">
              <Building2 className="size-3 shrink-0" />
              <span className="truncate">{card.company}</span>
            </p>
          )}
        </div>
        {card.assigneeName && (
          <span className="relative shrink-0">
            <Avatar name={card.assigneeName} src={card.assigneeAvatar} size="xs" />
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.interestLevel && <InterestBadge level={card.interestLevel} size="xs" />}
        <Badge tone="neutral" size="xs">
          {inStage === 0 ? "today" : `${inStage}d in stage`}
        </Badge>
        {card.nextFollowUpAt && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px]",
              overdue ? "font-medium text-danger-text" : "text-muted",
            )}
          >
            <Clock className="size-3" />
            {overdue ? relative(card.nextFollowUpAt) : fmtDate(card.nextFollowUpAt, tz)}
          </span>
        )}
      </div>

      {/* Dragging is a mouse gesture. These keep the board usable by keyboard
          and on a phone, where there is no drag at all — so they stay visible
          rather than waiting for a hover that touch never sends. */}
      <div className="relative mt-2 flex gap-1 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => onMove(PIPELINE_ORDER[index - 1]!)}
          className="flex-1 rounded-md border border-line py-1 text-[11px] text-muted transition-colors hover:bg-inset hover:text-strong disabled:opacity-30"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={index < 0 || index >= PIPELINE_ORDER.length - 1}
          onClick={() => onMove(PIPELINE_ORDER[index + 1]!)}
          className="flex-1 rounded-md border border-line py-1 text-[11px] text-muted transition-colors hover:bg-inset hover:text-strong disabled:opacity-30"
        >
          Forward →
        </button>
      </div>
      {!canReassign && <span className="sr-only">Read-only for leads assigned to others</span>}
    </article>
  );
}
