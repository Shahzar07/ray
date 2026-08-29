"use client";

import Link from "next/link";
import { Building2, Clock, MessageCircle, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { InterestBadge, StatusBadge } from "@/components/ui/display";
import { telHref, whatsAppHref, formatPhone } from "@/lib/domain/phone";
import { fmtDate, isOverdue, leadLocalHour, relative, trialDay } from "@/lib/domain/dates";
import { TRIAL_LENGTH_DAYS } from "@/lib/domain/constants";
import type { TodayCard } from "@/lib/queries/dashboard";

/**
 * One row of the work queue. Tap the card to open the lead; the phone and
 * WhatsApp buttons dial straight from the device without leaving the page.
 */
export function LeadQueueCard({
  lead,
  tz,
  showScore,
}: {
  lead: TodayCard;
  tz: string;
  showScore?: boolean;
}) {
  const overdue = isOverdue(lead.nextFollowUpAt);
  const localHour = leadLocalHour(lead.timezone);
  const day = lead.trialStartedAt ? trialDay(lead.trialStartedAt) : null;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border bg-surface px-3.5 py-3 shadow-xs transition-colors hover:border-line-strong",
        overdue ? "border-danger/25" : "border-line",
      )}
    >
      <Link href={`/leads?lead=${lead.id}`} className="absolute inset-0 rounded-xl">
        <span className="sr-only">Open {lead.fullName}</span>
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-strong">{lead.fullName}</span>
          {lead.interestLevel && <InterestBadge level={lead.interestLevel} size="xs" />}
          {day !== null && lead.trialStatus === "active" && (
            <Badge tone="accent" size="xs">
              Day {Math.min(day, TRIAL_LENGTH_DAYS)}/{TRIAL_LENGTH_DAYS}
            </Badge>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-subtle">
          {lead.company && (
            <span className="flex min-w-0 items-center gap-1">
              <Building2 className="size-3 shrink-0" />
              <span className="truncate">{lead.company}</span>
            </span>
          )}
          {lead.nextFollowUpAt && (
            <span className={cn("flex items-center gap-1", overdue && "font-medium text-danger-text")}>
              <Clock className="size-3" />
              {overdue ? relative(lead.nextFollowUpAt) : fmtDate(lead.nextFollowUpAt, tz)}
            </span>
          )}
          {localHour !== null && (
            <span className="tabular-nums">their {String(localHour).padStart(2, "0")}:00</span>
          )}
          {lead.attemptsCount > 0 && <span>{lead.attemptsCount} dialled</span>}
          {showScore && <span className="tabular-nums">score {lead.score}</span>}
        </div>

        {lead.followUpNote && <p className="mt-1.5 truncate text-[12px] text-muted">{lead.followUpNote}</p>}
      </div>

      <div className="relative flex shrink-0 items-center gap-1">
        <StatusBadge status={lead.status} short size="xs" className="mr-1 hidden sm:inline-flex" />
        <a
          href={telHref(lead.phonePrimary)}
          className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-accent hover:text-accent-text"
          aria-label={`Call ${formatPhone(lead.phonePrimary)}`}
        >
          <PhoneCall className="size-4" />
        </a>
        <a
          href={whatsAppHref(lead.phonePrimary)}
          target="_blank"
          rel="noreferrer"
          className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-success hover:text-success-text"
          aria-label="Open WhatsApp"
        >
          <MessageCircle className="size-4" />
        </a>
      </div>
    </div>
  );
}
