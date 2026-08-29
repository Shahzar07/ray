"use client";

import * as React from "react";
import { ArrowLeft, CalendarClock, Check, Mic, MicOff, Rocket, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/display";
import { useDictation } from "@/lib/hooks/use-dictation";
import { INTEREST_LEVEL, LEAD_STATUS } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import type { InterestLevel, LeadStatus } from "@/lib/db/schema";
import type { QueueLead } from "@/lib/queries/call-queue";

export type AnsweredPayload = {
  interestLevel?: InterestLevel | null;
  status?: LeadStatus;
  note?: string;
  nextFollowUpAt?: string | null;
  followUpChannel?: "call" | "whatsapp" | "email";
  startTrial?: boolean;
};

const QUICK_DATES: Array<[string, number]> = [
  ["Tomorrow", 1],
  ["3 days", 3],
  ["1 week", 7],
  ["2 weeks", 14],
];

const NEXT_STATUSES: LeadStatus[] = [
  "interested",
  "callback_later",
  "connected",
  "not_interested",
  "demo_scheduled",
  "lost",
];

/**
 * Opens the moment a caller taps "Answered". Everything that needs capturing
 * while the conversation is fresh sits on one screen: interest, outcome, note
 * (typed or dictated), the follow-up date, and the one button that starts the
 * 7-day demo week.
 */
export function AnsweredPanel({
  lead,
  tz,
  pending,
  onCancel,
  onSubmit,
}: {
  lead: QueueLead;
  tz: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: AnsweredPayload) => void;
}) {
  const [interest, setInterest] = React.useState<InterestLevel | null>(lead.interestLevel);
  const [status, setStatus] = React.useState<LeadStatus | undefined>(undefined);
  const [note, setNote] = React.useState("");
  const [followUpDays, setFollowUpDays] = React.useState<number | null>(null);
  const [startTrial, setStartTrial] = React.useState(false);
  const noteRef = React.useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation((text) => setNote((v) => (v ? `${v} ${text}` : text)));

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "n") {
        e.preventDefault();
        noteRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    const followUp =
      followUpDays === null
        ? undefined
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + followUpDays);
            d.setHours(10, 0, 0, 0);
            return d.toISOString();
          })();

    onSubmit({
      interestLevel: interest,
      status: startTrial ? undefined : status,
      note: note.trim() || undefined,
      nextFollowUpAt: followUp,
      followUpChannel: followUp ? "call" : undefined,
      startTrial: startTrial || undefined,
    });
  }

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-success/30 bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-success text-white">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <span className="text-[14px] font-semibold text-strong">They answered</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
          <ArrowLeft />
          Back
        </Button>
      </div>

      {/* Interest */}
      <Group label="How interested are they?">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(INTEREST_LEVEL) as InterestLevel[]).map((key) => (
            <Chip key={key} active={interest === key} onClick={() => setInterest(interest === key ? null : key)}>
              {INTEREST_LEVEL[key].label}
            </Chip>
          ))}
        </div>
      </Group>

      {/* Status */}
      <Group label="Where does that leave them?">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {NEXT_STATUSES.map((key) => (
            <Chip key={key} active={status === key} onClick={() => setStatus(status === key ? undefined : key)}>
              {LEAD_STATUS[key].short ?? LEAD_STATUS[key].label}
            </Chip>
          ))}
        </div>
      </Group>

      {/* Note */}
      <Group label="What did they say?" hint={<Kbd>n</Kbd>}>
        <div className="relative">
          <Textarea
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reception misses calls after 6pm. Wants the trial next week…"
            className="min-h-[84px] pr-11"
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.toggle}
              aria-label={dictation.listening ? "Stop dictation" : "Dictate the note"}
              className={cn(
                "absolute right-2 top-2 grid size-9 place-items-center rounded-lg transition-colors",
                dictation.listening
                  ? "bg-danger text-white [animation:pulse-ring_1.6s_ease-out_infinite]"
                  : "text-subtle hover:bg-inset hover:text-strong",
              )}
            >
              {dictation.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
          )}
        </div>
        {dictation.listening && (
          <p className="flex items-center gap-1.5 text-[11.5px] text-danger-text">
            <span className="size-1.5 animate-pulse rounded-full bg-danger" />
            Listening — speak normally, it types as you go.
          </p>
        )}
      </Group>

      {/* Follow-up */}
      <Group label="Call them back when?" hint={<Kbd>f</Kbd>}>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_DATES.map(([label, days]) => (
            <Chip key={label} active={followUpDays === days} onClick={() => setFollowUpDays(followUpDays === days ? null : days)}>
              <span className="flex flex-col items-center leading-tight">
                {label}
                <span className="text-[10px] opacity-70">
                  {fmtDate(new Date(Date.now() + days * 86_400_000), tz).replace(/ \d{4}$/, "")}
                </span>
              </span>
            </Chip>
          ))}
        </div>
      </Group>

      {/* The money button */}
      <button
        type="button"
        onClick={() => setStartTrial((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
          startTrial
            ? "border-accent bg-accent-soft"
            : "border-dashed border-line hover:border-line-strong hover:bg-sunken",
        )}
      >
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            startTrial ? "bg-accent text-accent-fg" : "bg-inset text-subtle",
          )}
        >
          <Rocket className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[13.5px] font-semibold", startTrial ? "text-accent-text" : "text-strong")}>
            Start the 7-day demo week
          </span>
          <span className="block text-[12px] text-muted">
            {startTrial
              ? `Trial runs to ${fmtDate(new Date(Date.now() + 7 * 86_400_000), tz)} · day 1/4/6/7 follow-ups get created`
              : "Sets the trial live and schedules the four check-in calls"}
          </span>
        </span>
        {startTrial && <Check className="size-5 shrink-0 text-accent" />}
      </button>

      <div className="flex gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onCancel} className="shrink-0">
          Cancel
        </Button>
        <Button variant="primary" size="lg" className="flex-1" loading={pending} onClick={submit}>
          {startTrial ? <Rocket /> : followUpDays !== null ? <CalendarClock /> : <Send />}
          Log call &amp; next lead
        </Button>
      </div>
    </div>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{label}</p>
        {hint}
      </div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-11 items-center justify-center rounded-lg border px-2 text-[13px] font-medium transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent-text"
          : "border-line bg-surface text-body hover:border-line-strong hover:bg-sunken",
      )}
    >
      {children}
    </button>
  );
}
