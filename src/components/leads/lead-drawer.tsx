"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Building2,
  CalendarClock,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  PhoneCall,
  Rocket,
  Tag,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  Hint,
} from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger, Avatar } from "@/components/ui/controls";
import { ProgressBar, SkeletonText, StatusBadge, TrialBadge } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { formatPhone, telHref, whatsAppHref } from "@/lib/domain/phone";
import { fmtDate, fmtDateTime, relative, trialDay, daysUntil, leadLocalHour } from "@/lib/domain/dates";
import { LEAD_SOURCE, TRIAL_LENGTH_DAYS } from "@/lib/domain/constants";
import { deleteLeads, trialAction } from "@/lib/actions/leads";
import { ActivityTimeline, type TimelineEntry } from "./activity-timeline";
import { NoteComposer } from "./note-composer";
import { DraftFollowUp } from "@/components/ai/draft-follow-up";
import { AssigneeCell, FollowUpCell, InterestCell, StatusCell, type Member } from "./inline-cells";

export type LeadDetail = {
  id: string;
  fullName: string;
  company: string | null;
  jobTitle: string | null;
  phonePrimary: string;
  phoneAlt: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  status: string;
  interestLevel: string | null;
  source: string;
  sourceNote: string | null;
  batchName: string | null;
  tags: string[];
  score: number;
  attemptsCount: number;
  connectsCount: number;
  lastAttemptedAt: string | null;
  lastConnectedAt: string | null;
  nextFollowUpAt: string | null;
  followUpNote: string | null;
  demoScheduledAt: string | null;
  trialStatus: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  convertedAt: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  createdAt: string;
  /** Mapped custom fields, already joined to their labels by the API. */
  custom?: { key: string; label: string; value: string }[];
};

export type DuplicateWarning = { userName: string | null; at: string } | null;

export function LeadDrawer({
  leadId,
  onClose,
  members,
  canReassign,
  tz,
}: {
  leadId: string | null;
  onClose: () => void;
  members: Member[];
  canReassign: boolean;
  tz: string;
}) {
  const [data, setData] = React.useState<{
    lead: LeadDetail;
    timeline: TimelineEntry[];
    duplicate: DuplicateWarning;
  } | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      setData(res.ok ? await res.json() : null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  React.useEffect(() => {
    if (!leadId) {
      setData(null);
      return;
    }
    void load();
  }, [leadId, load]);

  return (
    <Sheet open={Boolean(leadId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={data?.lead.fullName ?? "Lead"} side="right">
        {loading && !data ? (
          <div className="space-y-4 p-5">
            <SkeletonText lines={2} />
            <SkeletonText lines={5} />
          </div>
        ) : data ? (
          <DrawerBody
            lead={data.lead}
            timeline={data.timeline}
            duplicate={data.duplicate}
            members={members}
            canReassign={canReassign}
            tz={tz}
            onClose={onClose}
            onRefresh={load}
          />
        ) : (
          <div className="p-6 text-[13px] text-muted">That lead is not available to you.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  lead,
  timeline,
  duplicate,
  members,
  canReassign,
  tz,
  onClose,
  onRefresh,
}: {
  lead: LeadDetail;
  timeline: TimelineEntry[];
  duplicate: DuplicateWarning;
  members: Member[];
  canReassign: boolean;
  tz: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const localHour = leadLocalHour(lead.timezone);
  const day = lead.trialStartedAt ? trialDay(lead.trialStartedAt) : null;
  const endsIn = lead.trialEndsAt ? daysUntil(lead.trialEndsAt) : null;

  function runTrial(action: string, label: string) {
    startTransition(async () => {
      const result = await trialAction({ leadId: lead.id, action });
      if (result.ok) {
        toast({ title: label, tone: "success" });
        onRefresh();
        router.refresh();
      } else {
        toast({ title: "Not saved", description: result.error, tone: "danger" });
      }
    });
  }

  return (
    <>
      {/* Header */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-semibold tracking-tight text-strong">{lead.fullName}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
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
          <div className="flex items-center gap-1">
            {canReassign && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Delete lead
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </div>
        </div>

        {/* Primary actions */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" asChild className="flex-1 sm:flex-none">
            <a href={telHref(lead.phonePrimary)}>
              <PhoneCall />
              Call {formatPhone(lead.phonePrimary)}
            </a>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <a href={whatsAppHref(lead.phonePrimary)} target="_blank" rel="noreferrer">
              <MessageCircle />
              WhatsApp
            </a>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <a href={`/call?lead=${lead.id}`}>
              <Rocket />
              Call Mode
            </a>
          </Button>
        </div>

        {duplicate && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-warning-text">
            <AlertTriangle className="mt-px size-4 shrink-0" />
            <span>
              <strong className="font-semibold">{duplicate.userName ?? "Someone"}</strong> already called this
              number {relative(duplicate.at)}. Check with them before dialling again.
            </span>
          </div>
        )}
      </div>

      {/* Inline-editable summary strip */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line px-5 py-3.5 sm:grid-cols-4">
        <Fact label="Status">
          <StatusCell leadId={lead.id} status={lead.status as never} />
        </Fact>
        <Fact label="Interest">
          <InterestCell leadId={lead.id} level={lead.interestLevel as never} />
        </Fact>
        <Fact label="Follow-up">
          <FollowUpCell leadId={lead.id} date={lead.nextFollowUpAt} tz={tz} />
        </Fact>
        <Fact label="Owner">
          <AssigneeCell
            leadId={lead.id}
            assignedTo={lead.assignedTo}
            assigneeName={lead.assigneeName}
            members={members}
            canReassign={canReassign}
          />
        </Fact>
      </div>

      <Tabs defaultValue="activity" className="flex min-h-0 flex-1 flex-col">
        <div className="px-5 pt-3">
          <TabsList>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="trial">Demo week</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-3 outline-none">
          <NoteComposer leadId={lead.id} onSaved={onRefresh} compact />
          <DraftFollowUp leadId={lead.id} phone={lead.phonePrimary} className="mt-3" />
          <div className="mt-4 border-t border-line pt-2">
            <ActivityTimeline entries={timeline} tz={tz} />
          </div>
        </TabsContent>

        <TabsContent value="trial" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 outline-none">
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-sunken p-4">
              <div className="flex items-center justify-between gap-3">
                <TrialBadge status={lead.trialStatus as never} size="md" />
                {day !== null && lead.trialStatus === "active" && (
                  <span className="text-[12.5px] font-medium tabular-nums text-strong">
                    Day {Math.min(day, TRIAL_LENGTH_DAYS)} of {TRIAL_LENGTH_DAYS}
                  </span>
                )}
              </div>

              {lead.trialStartedAt && (
                <>
                  <div className="mt-3">
                    <ProgressBar
                      value={Math.min(day ?? 0, TRIAL_LENGTH_DAYS)}
                      max={TRIAL_LENGTH_DAYS}
                      tone={endsIn !== null && endsIn <= 2 ? "warning" : "accent"}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[11.5px] text-subtle">
                    <span>Started {fmtDate(lead.trialStartedAt, tz)}</span>
                    <span>
                      {endsIn !== null && endsIn >= 0
                        ? `Ends in ${endsIn} ${endsIn === 1 ? "day" : "days"}`
                        : `Ended ${relative(lead.trialEndsAt)}`}
                    </span>
                  </div>
                </>
              )}

              {lead.demoScheduledAt && !lead.trialStartedAt && (
                <p className="mt-3 text-[12.5px] text-muted">
                  Demo call scheduled for {fmtDateTime(lead.demoScheduledAt, tz)}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Trial cadence</p>
              {[
                [1, "Setup check"],
                [4, "Mid-week value check"],
                [6, "Pre-close"],
                [7, "Conversion call"],
              ].map(([taskDay, label]) => {
                const done = day !== null && day > Number(taskDay);
                const current = day !== null && day <= Number(taskDay) && (day > Number(taskDay) - 3 || taskDay === 1);
                return (
                  <div
                    key={String(taskDay)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12.5px]",
                      done
                        ? "border-line bg-sunken text-subtle line-through"
                        : current
                          ? "border-accent-soft-line bg-accent-soft text-accent-text"
                          : "border-line text-muted",
                    )}
                  >
                    <span className="font-mono text-[11px]">D{taskDay}</span>
                    <span>{label}</span>
                    {lead.trialStartedAt && (
                      <span className="ml-auto text-[11.5px] tabular-nums">
                        {fmtDate(
                          new Date(new Date(lead.trialStartedAt).getTime() + Number(taskDay) * 86_400_000),
                          tz,
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {lead.trialStatus === "none" && (
                <Button variant="primary" size="sm" loading={pending} onClick={() => runTrial("schedule", "Demo scheduled")}>
                  <CalendarClock />
                  Schedule demo
                </Button>
              )}
              {(lead.trialStatus === "none" || lead.trialStatus === "scheduled") && (
                <Button variant="primary" size="sm" loading={pending} onClick={() => runTrial("start", "Demo week started")}>
                  <Rocket />
                  Start 7-day demo week
                </Button>
              )}
              {(lead.trialStatus === "active" || lead.trialStatus === "ended_pending") && (
                <>
                  <Button variant="success" size="sm" loading={pending} onClick={() => runTrial("convert", "Converted 🎉")}>
                    <TrendingUp />
                    Mark converted
                  </Button>
                  <Button variant="secondary" size="sm" loading={pending} onClick={() => runTrial("churn", "Marked churned")}>
                    Didn&rsquo;t convert
                  </Button>
                </>
              )}
              {lead.trialStatus !== "none" && lead.trialStatus !== "converted" && (
                <Button variant="ghost" size="sm" loading={pending} onClick={() => runTrial("cancel", "Trial cancelled")}>
                  <Archive />
                  Cancel trial
                </Button>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 outline-none">
          <dl className="space-y-0">
            <Row label="Phone" icon={<PhoneCall className="size-3.5" />}>
              <a href={telHref(lead.phonePrimary)} className="font-mono text-accent-text hover:underline">
                {formatPhone(lead.phonePrimary)}
              </a>
            </Row>
            {lead.phoneAlt && (
              <Row label="Alt phone">
                <span className="font-mono">{formatPhone(lead.phoneAlt)}</span>
              </Row>
            )}
            {lead.email && (
              <Row label="Email" icon={<Mail className="size-3.5" />}>
                <a href={`mailto:${lead.email}`} className="text-accent-text hover:underline">
                  {lead.email}
                </a>
              </Row>
            )}
            {lead.website && (
              <Row label="Website" icon={<Globe className="size-3.5" />}>
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-accent-text hover:underline"
                >
                  {lead.website.replace(/^https?:\/\//, "")}
                  <ExternalLink className="size-3" />
                </a>
              </Row>
            )}
            <Row label="Location" icon={<MapPin className="size-3.5" />}>
              {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
              {localHour !== null && (
                <span className="ml-2 text-subtle">
                  · their local time {String(localHour).padStart(2, "0")}:00
                </span>
              )}
            </Row>
            <Row label="Source">
              {LEAD_SOURCE[lead.source as keyof typeof LEAD_SOURCE] ?? lead.source}
              {lead.batchName && <span className="ml-1.5 text-subtle">from {lead.batchName}</span>}
            </Row>
            <Row label="Attempts">
              <span className="tabular-nums">
                {lead.attemptsCount} dialled · {lead.connectsCount} connected
              </span>
            </Row>
            <Row label="Last attempt">{lead.lastAttemptedAt ? relative(lead.lastAttemptedAt) : "Never"}</Row>
            <Row label="Lead score">
              <span className="flex items-center gap-2">
                <span className="h-1 w-16 overflow-hidden rounded-full bg-inset">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${lead.score}%` }} />
                </span>
                <span className="tabular-nums">{lead.score}/100</span>
              </span>
            </Row>
            <Row label="Tags" icon={<Tag className="size-3.5" />}>
              {lead.tags.length ? (
                <span className="flex flex-wrap gap-1">
                  {lead.tags.map((tag) => (
                    <Badge key={tag} size="xs">
                      {tag}
                    </Badge>
                  ))}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Added">{fmtDate(lead.createdAt, tz)}</Row>

            {/* Whatever this org tracks beyond the built-in fields — website,
                socials, anything mapped during an import. */}
            {lead.custom?.map((field) => (
              <Row key={field.key} label={field.label}>
                {isLink(field.value) ? (
                  <a
                    href={hrefFor(field.value)}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-accent-text hover:underline"
                  >
                    {field.value.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  field.value
                )}
              </Row>
            ))}
          </dl>
        </TabsContent>
      </Tabs>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={`Delete ${lead.fullName}?`}
          description="This removes the lead and its whole call history. It cannot be undone."
        >
          <DialogBody>
            <p className="text-[13px] text-subtle">
              To keep the record but take it out of the queues, close this and use{" "}
              <span className="font-medium text-strong">Archive</span> instead.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-danger text-danger-fg hover:bg-danger/90"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await deleteLeads({ leadIds: [lead.id] });
                  setConfirmDelete(false);
                  if (result.ok) {
                    toast({ title: `${lead.fullName} deleted`, tone: "success" });
                    onClose();
                    router.refresh();
                  } else {
                    toast({ title: "Nothing deleted", description: result.error, tone: "danger" });
                  }
                });
              }}
            >
              <Trash2 />
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A value worth making clickable: a URL, or a bare domain/handle from a sheet. */
function isLink(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^(www\.|[\w-]+\.[a-z]{2,})/i.test(value);
}

function hrefFor(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Row({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 border-b border-line py-2.5 last:border-0">
      <dt className="flex w-[110px] shrink-0 items-center gap-1.5 text-[12.5px] text-subtle">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[12.5px] text-body">{children}</dd>
    </div>
  );
}
