"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Building2, CalendarClock, CheckCircle2, PhoneCall, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { trialAction } from "@/lib/actions/leads";
import { TRIAL_LENGTH_DAYS, TRIAL_STATUS, TONE_HEX } from "@/lib/domain/constants";
import { TRIAL_TASKS } from "@/lib/domain/trials";
import { daysUntil, fmtDate, relative, trialDay } from "@/lib/domain/dates";
import { telHref, formatPhone } from "@/lib/domain/phone";
import { cn } from "@/lib/utils";
import type { TodayCard } from "@/lib/queries/dashboard";

export type TrialColumns = {
  scheduled: TodayCard[];
  active: TodayCard[];
  pending: TodayCard[];
  converted: TodayCard[];
  churned: TodayCard[];
};

const COLUMNS = [
  { key: "scheduled", status: "scheduled" },
  { key: "active", status: "active" },
  { key: "pending", status: "ended_pending" },
  { key: "converted", status: "converted" },
  { key: "churned", status: "churned" },
] as const;

export function TrialBoard({ columns, tz }: { columns: TrialColumns; tz: string }) {
  return (
    <div className="grid gap-3 lg:grid-cols-5">
      {COLUMNS.map((column) => {
        const meta = TRIAL_STATUS[column.status];
        const items = columns[column.key];
        return (
          <section key={column.key} className="flex min-w-0 flex-col rounded-xl border border-line bg-sunken">
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <span className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: TONE_HEX[meta.tone] }}
                  aria-hidden
                />
                <h2 className="text-[12.5px] font-semibold text-strong">{meta.label}</h2>
              </span>
              <span className="rounded-md bg-inset px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
                {items.length}
              </span>
            </header>

            <div className="flex flex-col gap-2 p-2">
              {items.length === 0 ? (
                <p className="px-1.5 py-6 text-center text-[12px] text-subtle">Nothing here</p>
              ) : (
                items.map((lead) => <TrialCard key={lead.id} lead={lead} tz={tz} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TrialCard({ lead, tz }: { lead: TodayCard; tz: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const day = lead.trialStartedAt ? trialDay(lead.trialStartedAt) : null;
  const endsIn = daysUntil(lead.trialEndsAt);
  const isActive = lead.trialStatus === "active";
  const isPending = lead.trialStatus === "ended_pending";
  const urgent = isActive && endsIn !== null && endsIn <= 2;

  function act(action: "convert" | "churn") {
    startTransition(async () => {
      const result = await trialAction({ leadId: lead.id, action });
      if (!result.ok) {
        toast({ title: "Not saved", description: result.error, tone: "danger" });
        return;
      }
      toast({
        title: action === "convert" ? `${lead.fullName} converted` : `${lead.fullName} marked churned`,
        tone: action === "convert" ? "success" : "info",
      });
      router.refresh();
    });
  }

  return (
    <article
      className={cn(
        "group relative rounded-lg border bg-surface p-2.5 shadow-xs transition-colors hover:border-line-strong",
        urgent ? "border-warning/40" : isPending ? "border-danger/30" : "border-line",
      )}
    >
      <Link href={`/leads?lead=${lead.id}`} className="absolute inset-0 rounded-lg">
        <span className="sr-only">Open {lead.fullName}</span>
      </Link>

      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-strong">{lead.fullName}</p>
        {lead.assigneeName && (
          <span className="relative shrink-0">
            <Avatar name={lead.assigneeName} size="xs" />
          </span>
        )}
      </div>

      {lead.company && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-subtle">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">{lead.company}</span>
        </p>
      )}

      {isActive && day !== null && <DayTrack day={day} />}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        {isActive && endsIn !== null && (
          <span className={cn("font-medium tabular-nums", urgent ? "text-warning-text" : "text-muted")}>
            {endsIn <= 0 ? "ends today" : `${endsIn}d left`}
          </span>
        )}
        {lead.trialStatus === "scheduled" && lead.nextFollowUpAt && (
          <span className="flex items-center gap-1 text-muted">
            <CalendarClock className="size-3" />
            {fmtDate(lead.nextFollowUpAt, tz)}
          </span>
        )}
        {isPending && lead.trialEndsAt && (
          <span className="font-medium text-danger-text">ended {relative(lead.trialEndsAt)}</span>
        )}
        {lead.trialStatus === "converted" && lead.trialEndsAt && (
          <span className="text-muted">{fmtDate(lead.trialEndsAt, tz)}</span>
        )}
      </div>

      {(isPending || urgent) && (
        <div className="relative mt-2 flex gap-1.5">
          <Button
            variant="success"
            size="xs"
            className="flex-1"
            loading={pending}
            onClick={() => act("convert")}
          >
            <CheckCircle2 />
            Won
          </Button>
          <Button variant="secondary" size="xs" className="flex-1" loading={pending} onClick={() => act("churn")}>
            <XCircle />
            Lost
          </Button>
          <a
            href={telHref(lead.phonePrimary)}
            className="grid size-7 shrink-0 place-items-center rounded-md border border-line text-muted transition-colors hover:border-accent hover:text-accent-text"
            aria-label={`Call ${formatPhone(lead.phonePrimary)}`}
          >
            <PhoneCall className="size-3.5" />
          </a>
        </div>
      )}
    </article>
  );
}

/** Seven pips, one per trial day, with the four cadence touches marked. */
function DayTrack({ day }: { day: number }) {
  const taskDays = new Set(TRIAL_TASKS.map((t) => t.day));
  return (
    <div className="mt-2">
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: TRIAL_LENGTH_DAYS }, (_, i) => {
          const n = i + 1;
          const done = n < day;
          const today = n === day;
          return (
            <span
              key={n}
              title={taskDays.has(n) ? TRIAL_TASKS.find((t) => t.day === n)!.note : `Day ${n}`}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                today ? "bg-accent" : done ? "bg-accent/40" : "bg-inset",
                taskDays.has(n) && !done && !today && "ring-1 ring-inset ring-accent/30",
              )}
            />
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Day {Math.min(day, TRIAL_LENGTH_DAYS)} of {TRIAL_LENGTH_DAYS}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export function TrialAlerts({ ending, stale, tz }: { ending: TodayCard[]; stale: TodayCard[]; tz: string }) {
  if (ending.length === 0 && stale.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ending.length > 0 && (
        <AlertPanel
          tone="warning"
          icon={<AlarmClock />}
          title={`${ending.length} ${ending.length === 1 ? "trial ends" : "trials end"} within 48 hours`}
          blurb="Day 6 is the pre-close. Call before the week runs out, not after."
          leads={ending}
          tz={tz}
        />
      )}
      {stale.length > 0 && (
        <AlertPanel
          tone="danger"
          icon={<XCircle />}
          title={`${stale.length} ${stale.length === 1 ? "trial has" : "trials have"} ended with no decision`}
          blurb="Over two days without a conversion call. These go cold fast."
          leads={stale}
          tz={tz}
        />
      )}
    </div>
  );
}

function AlertPanel({
  tone,
  icon,
  title,
  blurb,
  leads,
  tz,
}: {
  tone: "warning" | "danger";
  icon: React.ReactNode;
  title: string;
  blurb: string;
  leads: TodayCard[];
  tz: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        tone === "warning" ? "border-warning/30 bg-warning-soft" : "border-danger/25 bg-danger-soft",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-px [&_svg]:size-4", tone === "warning" ? "text-warning" : "text-danger")}>{icon}</span>
        <div className="min-w-0">
          <p className={cn("text-[13px] font-semibold", tone === "warning" ? "text-warning-text" : "text-danger-text")}>
            {title}
          </p>
          <p className={cn("mt-0.5 text-[12px]", tone === "warning" ? "text-warning-text/80" : "text-danger-text/80")}>
            {blurb}
          </p>
        </div>
      </div>
      <ul className="mt-2.5 space-y-1">
        {leads.slice(0, 5).map((lead) => (
          <li key={lead.id}>
            <Link
              href={`/leads?lead=${lead.id}`}
              className="flex items-center justify-between gap-2 rounded-md bg-surface/70 px-2 py-1.5 text-[12.5px] transition-colors hover:bg-surface"
            >
              <span className="min-w-0 truncate font-medium text-strong">{lead.fullName}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {lead.trialEndsAt ? fmtDate(lead.trialEndsAt, tz) : "—"}
              </span>
            </Link>
          </li>
        ))}
        {leads.length > 5 && (
          <li className="px-2 pt-0.5 text-[11.5px] text-muted">and {leads.length - 5} more below</li>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversion tables                                                   */
/* ------------------------------------------------------------------ */

export function ConversionByPerson({
  rows,
}: {
  rows: Array<{ userId: string; name: string | null; avatarUrl: string | null; started: number; converted: number; churned: number }>;
}) {
  const withTrials = rows.filter((r) => r.started > 0);
  if (withTrials.length === 0) {
    return <EmptyState compact title="No finished trials yet" description="Conversion rates appear once a demo week has run." />;
  }

  const best = Math.max(...withTrials.map((r) => (r.started ? r.converted / r.started : 0)), 0.0001);

  return (
    <ul className="divide-y divide-[var(--line)]">
      {withTrials.map((row) => {
        const rate = row.started ? row.converted / row.started : 0;
        return (
          <li key={row.userId} className="flex items-center gap-3 py-2.5">
            <Avatar name={row.name} src={row.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-body">{row.name ?? "Unassigned"}</span>
            <div className="hidden w-32 sm:block">
              <div className="h-1.5 overflow-hidden rounded-full bg-inset">
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-500"
                  style={{ width: `${(rate / best) * 100}%` }}
                />
              </div>
            </div>
            <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums text-strong">
              {Math.round(rate * 100)}%
            </span>
            <span className="w-20 shrink-0 text-right text-[11.5px] tabular-nums text-subtle">
              {row.converted}/{row.started}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ConversionByBatch({
  rows,
}: {
  rows: Array<{ batchId: string | null; filename: string; leadCount: number; started: number; converted: number }>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title="No trials traced to a sheet yet"
        description="Once imported leads reach a demo week, this shows which scrapes are worth repeating."
      />
    );
  }

  return (
    <ul className="divide-y divide-[var(--line)]">
      {rows.map((row) => {
        const rate = row.started ? row.converted / row.started : 0;
        return (
          <li key={row.batchId ?? row.filename} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <Link
                href={`/leads?batch=${row.batchId}`}
                className="block truncate text-[13px] font-medium text-strong hover:text-accent-text hover:underline"
              >
                {row.filename}
              </Link>
              <p className="text-[11.5px] text-subtle">
                {row.leadCount.toLocaleString()} leads · {row.started} reached a demo week
              </p>
            </div>
            <Badge tone={rate >= 0.5 ? "success" : rate > 0 ? "warning" : "neutral"} size="sm" className="shrink-0 tabular-nums">
              {Math.round(rate * 100)}% won
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
