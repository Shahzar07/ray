"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  PhoneCall,
  PhoneOff,
  Rocket,
  SkipForward,
  Undo2,
  Voicemail,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Kbd, ProgressBar, StatusBadge } from "@/components/ui/display";
import { Hint } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { logCall } from "@/lib/actions/leads";
import { formatPhone, telHref, whatsAppHref } from "@/lib/domain/phone";
import { fmt, fmtDate, relative, trialDay } from "@/lib/domain/dates";
import { CALL_OUTCOME, TRIAL_LENGTH_DAYS } from "@/lib/domain/constants";
import { REASON_LABEL } from "@/lib/domain/queue";
import type { QueueLead } from "@/lib/queries/call-queue";
import type { CallOutcome } from "@/lib/db/schema";
import { AnsweredPanel } from "./answered-panel";

/** The six buttons a caller actually presses, in thumb order. */
const OUTCOMES: Array<{ key: CallOutcome; label: string; icon: React.ElementType; hotkey: string; tone: string }> = [
  { key: "answered", label: "Answered", icon: CheckCircle2, hotkey: "1", tone: "success" },
  { key: "no_answer", label: "No answer", icon: PhoneOff, hotkey: "2", tone: "neutral" },
  { key: "busy", label: "Busy", icon: Clock, hotkey: "3", tone: "warning" },
  { key: "voicemail", label: "Voicemail", icon: Voicemail, hotkey: "4", tone: "info" },
  { key: "gatekeeper", label: "Gatekeeper", icon: Building2, hotkey: "5", tone: "warning" },
  { key: "wrong_number", label: "Wrong number", icon: X, hotkey: "6", tone: "danger" },
];

const TONE_BTN: Record<string, string> = {
  success: "border-success/35 bg-success-soft text-success-text hover:border-success hover:brightness-[1.02]",
  neutral: "border-line bg-surface text-body hover:border-line-strong",
  warning: "border-warning/35 bg-warning-soft text-warning-text hover:border-warning",
  info: "border-info/35 bg-info-soft text-info-text hover:border-info",
  danger: "border-danger/30 bg-danger-soft text-danger-text hover:border-danger",
};

export function CallMode({
  queue,
  tz,
  callingWindow,
  targets,
  startedWith,
}: {
  queue: QueueLead[];
  tz: string;
  callingWindow: [number, number];
  targets: { dials: number; connects: number };
  startedWith: { dials: number; answered: number; interested: number };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [index, setIndex] = React.useState(0);
  const [answering, setAnswering] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [session, setSession] = React.useState({ dials: 0, answered: 0, interested: 0 });
  const [dialledAt, setDialledAt] = React.useState<number | null>(null);

  const lead = queue[index];
  const remaining = queue.length - index;

  const advance = React.useCallback(() => {
    setAnswering(false);
    setDialledAt(null);
    setIndex((i) => i + 1);
  }, []);

  const record = React.useCallback(
    (outcome: CallOutcome, extra?: Record<string, unknown>) => {
      if (!lead) return;
      const durationSeconds = dialledAt ? Math.min(Math.round((Date.now() - dialledAt) / 1000), 14400) : undefined;

      setSession((s) => ({
        dials: s.dials + 1,
        answered: s.answered + (outcome === "answered" ? 1 : 0),
        interested: s.interested + (extra?.interestLevel === "hot" || extra?.interestLevel === "warm" ? 1 : 0),
      }));

      startTransition(async () => {
        const result = await logCall({ leadId: lead.id, outcome, durationSeconds, ...extra });
        if (result.ok) {
          toast({
            title: `${CALL_OUTCOME[outcome].label} — logged`,
            description: lead.fullName,
            tone: outcome === "answered" ? "success" : "info",
            action: {
              label: "Undo",
              onClick: async () => {
                // The activity row stays (append-only); we step back so the
                // caller can re-log the outcome correctly.
                setIndex((i) => Math.max(0, i - 1));
                setSession((s) => ({ ...s, dials: Math.max(0, s.dials - 1) }));
                router.refresh();
              },
            },
          });
          advance();
          router.refresh();
        } else {
          toast({ title: "Not logged", description: result.error, tone: "danger" });
        }
      });
    },
    [advance, dialledAt, lead, router, toast],
  );

  /* Number keys log an outcome; the rest mirror the shortcut sheet. */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || !lead) return;

      const outcome = OUTCOMES.find((o) => o.hotkey === e.key);
      if (outcome) {
        e.preventDefault();
        if (outcome.key === "answered") setAnswering(true);
        else record(outcome.key);
        return;
      }
      if (e.key === "s") {
        e.preventDefault();
        advance();
      }
      if (e.key === "Escape" && answering) {
        e.preventDefault();
        setAnswering(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, answering, lead, record]);

  if (!lead) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas">
        <TopBar session={session} startedWith={startedWith} targets={targets} remaining={0} />
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            className="max-w-md border-0"
            icon={<CheckCircle2 />}
            title={queue.length === 0 ? "Queue is empty" : "Queue finished"}
            description={
              queue.length === 0
                ? `Nothing to dial inside the ${callingWindow[0]}:00–${callingWindow[1]}:00 calling window right now. Leads whose local time is outside it are held back until they are reachable.`
                : `You worked ${session.dials} ${session.dials === 1 ? "lead" : "leads"} this session. Nice.`
            }
            action={
              <div className="flex gap-2">
                <Button variant="secondary" asChild>
                  <Link href="/today">Back to Today</Link>
                </Button>
                <Button variant="primary" asChild>
                  <Link href="/leads">Open the lead table</Link>
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const localHour = lead.timezone ? Number(fmt(new Date(), "H", lead.timezone)) : null;
  const localTime = lead.timezone ? fmt(new Date(), "h:mm a", lead.timezone) : null;
  const day = lead.trialStartedAt ? trialDay(lead.trialStartedAt) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <TopBar session={session} startedWith={startedWith} targets={targets} remaining={remaining} />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-4 pt-3 sm:px-6">
        {/* Why this lead is here */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <Badge tone={lead.reason === "overdue" ? "danger" : lead.reason === "trial" ? "accent" : "info"} size="md" dot>
            {REASON_LABEL[lead.reason]}
          </Badge>
          <span className="text-[12px] tabular-nums text-subtle">
            {index + 1} of {queue.length}
          </span>
        </div>

        {lead.duplicate && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft px-3.5 py-3 text-[13px] leading-relaxed text-warning-text">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-semibold">{lead.duplicate.userName ?? "A teammate"}</strong> called this
              number {relative(lead.duplicate.at)}. Check with them before you dial.
            </span>
          </div>
        )}

        {/* The card */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-[26px] font-semibold leading-tight tracking-tight text-strong">
                {lead.fullName}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted">
                {lead.jobTitle && <span>{lead.jobTitle}</span>}
                {lead.jobTitle && lead.company && <span aria-hidden>·</span>}
                {lead.company && (
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3.5" />
                    {lead.company}
                  </span>
                )}
              </p>
            </div>
            <StatusBadge status={lead.status} size="md" />
          </div>

          {/* Dial */}
          <a
            href={telHref(lead.phonePrimary)}
            onClick={() => setDialledAt(Date.now())}
            className="mt-4 flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-accent text-[20px] font-semibold tracking-tight text-accent-fg shadow-sm transition-[filter] edge-light hover:brightness-105 active:translate-y-px"
          >
            <PhoneCall className="size-5" strokeWidth={2.4} />
            {formatPhone(lead.phonePrimary)}
          </a>

          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="md" className="flex-1" asChild>
              <a href={whatsAppHref(lead.phonePrimary)} target="_blank" rel="noreferrer">
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
            <Button variant="secondary" size="md" className="flex-1" asChild>
              <Link href={`/leads?lead=${lead.id}`}>
                Full record
                <ArrowRight />
              </Link>
            </Button>
          </div>

          {/* Context strip */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-4 sm:grid-cols-4">
            <Fact label="Their time">
              <span
                className={cn(
                  "tabular-nums",
                  localHour !== null && (localHour < callingWindow[0] || localHour >= callingWindow[1])
                    ? "text-warning-text"
                    : "text-body",
                )}
              >
                {localTime ?? "—"}
              </span>
            </Fact>
            <Fact label="Attempts">
              <span className="tabular-nums">
                {lead.attemptsCount} · {lead.connectsCount} connected
              </span>
            </Fact>
            <Fact label="Location">
              <span className="flex items-center gap-1 truncate">
                {lead.city && <MapPin className="size-3 shrink-0" />}
                {lead.city ?? "—"}
              </span>
            </Fact>
            <Fact label="Score">
              <span className="tabular-nums">{lead.score}/100</span>
            </Fact>
          </dl>

          {lead.followUpNote && (
            <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent-text">
              {lead.followUpNote}
            </p>
          )}

          {lead.trialStatus === "active" && day !== null && (
            <div className="mt-3 rounded-lg border border-line bg-sunken p-3">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-strong">
                  Demo week — day {Math.min(day, TRIAL_LENGTH_DAYS)} of {TRIAL_LENGTH_DAYS}
                </span>
                <span className="text-subtle">ends {fmtDate(lead.trialEndsAt, tz)}</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={Math.min(day, TRIAL_LENGTH_DAYS)} max={TRIAL_LENGTH_DAYS} tone="accent" />
              </div>
            </div>
          )}

          {/* Last three touches */}
          {lead.recent.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-line pt-3.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-subtle">Last touches</p>
              {lead.recent.map((entry, i) => (
                <div key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
                  <span className="shrink-0 tabular-nums text-subtle">{relative(entry.at)}</span>
                  <span className="min-w-0 flex-1 text-body">
                    {entry.outcome ? (
                      <span className="font-medium">{CALL_OUTCOME[entry.outcome as CallOutcome].label}</span>
                    ) : (
                      <span className="font-medium capitalize">{entry.type.replace(/_/g, " ")}</span>
                    )}
                    {entry.body && <span className="text-muted"> — {entry.body}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outcome pad */}
        {answering ? (
          <AnsweredPanel
            lead={lead}
            tz={tz}
            pending={pending}
            onCancel={() => setAnswering(false)}
            onSubmit={(payload) => record("answered", payload)}
          />
        ) : (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              How did it go?
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OUTCOMES.map((outcome) => (
                <button
                  key={outcome.key}
                  type="button"
                  disabled={pending}
                  onClick={() => (outcome.key === "answered" ? setAnswering(true) : record(outcome.key))}
                  className={cn(
                    "relative flex h-[86px] flex-col items-center justify-center gap-2 rounded-xl border text-[13.5px] font-medium shadow-xs transition-all active:translate-y-px disabled:opacity-50",
                    TONE_BTN[outcome.tone],
                  )}
                >
                  <outcome.icon className="size-6" strokeWidth={2} />
                  {outcome.label}
                  <Kbd className="absolute right-2 top-2 hidden sm:inline-flex">{outcome.hotkey}</Kbd>
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={advance} disabled={pending}>
                <SkipForward />
                Skip
                <Kbd className="ml-1">s</Kbd>
              </Button>
              {index > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setIndex((i) => i - 1)}>
                  <Undo2 />
                  Previous lead
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-body">{children}</dd>
    </div>
  );
}

function TopBar({
  session,
  startedWith,
  targets,
  remaining,
}: {
  session: { dials: number; answered: number; interested: number };
  startedWith: { dials: number; answered: number; interested: number };
  targets: { dials: number; connects: number };
  remaining: number;
}) {
  const totalDials = startedWith.dials + session.dials;
  const totalAnswered = startedWith.answered + session.answered;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[color-mix(in_oklch,var(--canvas)_88%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Hint label="Leave Call Mode">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/today" aria-label="Exit Call Mode">
              <X />
            </Link>
          </Button>
        </Hint>

        <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-strong">
          <Rocket className="size-4 text-accent" />
          Call Mode
        </span>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <Counter label="Session" value={session.dials} sub="dials" />
          <Counter label="Today" value={totalDials} sub={`/ ${targets.dials}`} />
          <Counter label="Connects" value={totalAnswered} sub={`/ ${targets.connects}`} tone="success" />
          <span className="hidden text-[11.5px] tabular-nums text-subtle sm:block">{remaining} left</span>
        </div>
      </div>
      <ProgressBar value={totalDials} max={targets.dials} showTrack={false} className="h-[2px] rounded-none" />
    </header>
  );
}

function Counter({
  label,
  value,
  sub,
  tone = "accent",
}: {
  label: string;
  value: number;
  sub: string;
  tone?: "accent" | "success";
}) {
  return (
    <div className="text-right leading-none">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-subtle">{label}</div>
      <div className="mt-1 flex items-baseline justify-end gap-1">
        <span className={cn("text-[15px] font-semibold tabular-nums", tone === "success" ? "text-success-text" : "text-strong")}>
          {value}
        </span>
        <span className="text-[10.5px] tabular-nums text-subtle">{sub}</span>
      </div>
    </div>
  );
}

