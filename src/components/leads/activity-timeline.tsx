"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  CalendarClock,
  FileText,
  Mail,
  MessageCircle,
  PhoneCall,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/controls";
import { EmptyState, OutcomeBadge } from "@/components/ui/display";
import { fmtDateTime, relative } from "@/lib/domain/dates";
import { CALL_OUTCOME, TONE_HEX } from "@/lib/domain/constants";
import type { ActivityType, CallOutcome } from "@/lib/db/schema";

export type TimelineEntry = {
  id: string;
  type: ActivityType;
  callOutcome: CallOutcome | null;
  durationSeconds: number | null;
  body: string | null;
  fromValue: unknown;
  toValue: unknown;
  aiGenerated: boolean;
  createdAt: string;
  userName: string | null;
  userAvatar: string | null;
};

const ICONS: Record<ActivityType, React.ElementType> = {
  call: PhoneCall,
  note: FileText,
  status_change: ArrowRightLeft,
  assignment: UserRound,
  follow_up_set: CalendarClock,
  field_change: ArrowRightLeft,
  import: Upload,
  whatsapp: MessageCircle,
  email: Mail,
  trial_event: Sparkles,
};

function describe(entry: TimelineEntry): string {
  const to = entry.toValue as Record<string, unknown> | null;
  const from = entry.fromValue as Record<string, unknown> | null;

  switch (entry.type) {
    case "call":
      return entry.callOutcome ? CALL_OUTCOME[entry.callOutcome].label : "Called";
    case "note":
      return "Added a note";
    case "status_change":
      return from?.status && to?.status
        ? `Status ${String(from.status).replace(/_/g, " ")} → ${String(to.status).replace(/_/g, " ")}`
        : "Changed status";
    case "assignment":
      return "Reassigned";
    case "follow_up_set":
      return to?.nextFollowUpAt ? `Follow-up set for ${fmtDateTime(String(to.nextFollowUpAt))}` : "Follow-up cleared";
    case "trial_event":
      return entry.body ?? "Trial updated";
    case "import":
      return entry.body ?? "Imported";
    default: {
      const keys = to ? Object.keys(to) : [];
      return keys.length ? `Updated ${keys.join(", ").replace(/([A-Z])/g, " $1").toLowerCase()}` : "Updated";
    }
  }
}

function duration(seconds: number | null): string | null {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function ActivityTimeline({ entries, tz }: { entries: TimelineEntry[]; tz: string }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={<FileText />}
        title="Nothing logged yet"
        description="Every call, note and status change lands here — append-only, never edited."
      />
    );
  }

  return (
    <ol className="relative space-y-0">
      <span className="absolute bottom-3 left-[13px] top-3 w-px bg-line" aria-hidden />
      {entries.map((entry) => {
        const Icon = ICONS[entry.type];
        const answered = entry.callOutcome === "answered";
        return (
          <li key={entry.id} className="relative flex gap-3 py-2.5">
            <span
              className={cn(
                "relative z-10 grid size-[27px] shrink-0 place-items-center rounded-full border border-line bg-surface",
              )}
              style={answered ? { borderColor: TONE_HEX.success, color: TONE_HEX.success } : undefined}
            >
              <Icon className={cn("size-[13px]", !answered && "text-subtle")} />
            </span>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[12.5px] font-medium text-strong">{describe(entry)}</span>
                {entry.callOutcome && entry.type === "call" && (
                  <OutcomeBadge outcome={entry.callOutcome} size="xs" />
                )}
                {duration(entry.durationSeconds) && (
                  <span className="font-mono text-[11px] text-subtle">{duration(entry.durationSeconds)}</span>
                )}
                {entry.aiGenerated && (
                  <span className="flex items-center gap-1 text-[10.5px] font-medium text-accent-text">
                    <Sparkles className="size-3" />
                    AI
                  </span>
                )}
              </div>

              {entry.body && entry.type !== "trial_event" && entry.type !== "import" && (
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-sunken px-2.5 py-2 text-[12.5px] leading-relaxed text-body">
                  {entry.body}
                </p>
              )}

              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-subtle">
                {entry.userName && <Avatar name={entry.userName} src={entry.userAvatar} size="xs" />}
                <span>{entry.userName ?? "System"}</span>
                <span aria-hidden>·</span>
                <time dateTime={entry.createdAt} title={fmtDateTime(entry.createdAt, tz)}>
                  {relative(entry.createdAt)}
                </time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
