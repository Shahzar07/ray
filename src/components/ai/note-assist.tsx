"use client";

import * as React from "react";
import { Lightbulb, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { coachObjectionAction, suggestFromNoteAction, type NoteSuggestionResult } from "@/lib/actions/ai";
import { useAiEnabled } from "@/lib/hooks/use-ai";
import { INTEREST_LEVEL, LEAD_STATUS } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import type { InterestLevel, LeadStatus } from "@/lib/db/schema";

/** What the caller actually accepted, after unticking anything they disagreed with. */
export type AcceptedSuggestion = {
  status?: LeadStatus;
  interestLevel?: InterestLevel;
  followUpAt?: string | null;
  followUpChannel?: "call" | "whatsapp" | "email";
  tags?: string[];
};

/**
 * "Read my note" — the feature the brief calls the highest value, because it
 * removes the data entry that makes small teams abandon a CRM.
 *
 * It is a suggestion, always. Nothing is written until the caller taps Apply,
 * and every chip can be unticked first — a model that guessed "not interested"
 * must never be able to set that on its own.
 */
export function NoteAssist({
  leadId,
  note,
  onAccept,
  applying,
}: {
  leadId: string;
  note: string;
  onAccept: (accepted: AcceptedSuggestion, summary: string) => void;
  applying?: boolean;
}) {
  const enabled = useAiEnabled();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [suggestion, setSuggestion] = React.useState<NoteSuggestionResult | null>(null);
  const [dropped, setDropped] = React.useState<Set<string>>(new Set());

  const tooShort = note.trim().length < 12;
  if (!enabled) return null;

  function read() {
    startTransition(async () => {
      const result = await suggestFromNoteAction({ leadId, note: note.trim() });
      if (!result.ok) {
        toast({ title: "No suggestion", description: result.error, tone: "info" });
        return;
      }
      setSuggestion(result.data ?? null);
      setDropped(new Set());
    });
  }

  function accept() {
    if (!suggestion) return;
    const accepted: AcceptedSuggestion = {};
    if (suggestion.status && !dropped.has("status")) accepted.status = suggestion.status;
    if (suggestion.interestLevel && !dropped.has("interest")) accepted.interestLevel = suggestion.interestLevel;
    if (suggestion.followUpAt && !dropped.has("followUp")) {
      accepted.followUpAt = suggestion.followUpAt;
      accepted.followUpChannel = suggestion.followUpChannel ?? "call";
    }
    const tags = suggestion.tags.filter((t) => !dropped.has(`tag:${t}`));
    if (tags.length > 0) accepted.tags = tags;

    onAccept(accepted, suggestion.summary);
    setSuggestion(null);
  }

  function toggle(key: string) {
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!suggestion) {
    return (
      <Button
        type="button"
        variant="subtle"
        size="sm"
        onClick={read}
        loading={pending}
        disabled={tooShort}
        title={tooShort ? "Write a little more first" : "Turn this note into fields"}
      >
        <Sparkles />
        Read my note
      </Button>
    );
  }

  const chips: Array<{ key: string; label: string; value: string }> = [];
  if (suggestion.status) {
    chips.push({ key: "status", label: "Status", value: LEAD_STATUS[suggestion.status].label });
  }
  if (suggestion.interestLevel) {
    chips.push({ key: "interest", label: "Interest", value: INTEREST_LEVEL[suggestion.interestLevel].label });
  }
  if (suggestion.followUpAt) {
    chips.push({ key: "followUp", label: "Follow up", value: fmtDate(suggestion.followUpAt) });
  }
  for (const tag of suggestion.tags) chips.push({ key: `tag:${tag}`, label: "Tag", value: tag });

  const anyKept = chips.some((chip) => !dropped.has(chip.key));

  return (
    <div className="space-y-2.5 rounded-xl border border-accent-soft-line bg-accent-soft p-3">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
        <p className="flex-1 text-[12.5px] leading-relaxed text-accent-text">{suggestion.summary}</p>
        <button
          type="button"
          onClick={() => setSuggestion(null)}
          aria-label="Dismiss the suggestion"
          className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded-md text-accent-text/70 transition-colors hover:bg-surface/60 hover:text-accent-text"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {chips.length > 0 ? (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wide text-accent-text/70">
            Tap to drop anything it got wrong
          </p>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const off = dropped.has(chip.key);
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => toggle(chip.key)}
                  aria-pressed={!off}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium ring-1 ring-inset transition-all",
                    off
                      ? "bg-transparent text-accent-text/40 line-through ring-accent/20"
                      : "bg-surface text-strong ring-line",
                  )}
                >
                  <span className="text-subtle">{chip.label}</span>
                  {chip.value}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-[12px] text-accent-text/80">
          Nothing confident enough to fill in — the note will just be saved as written.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="primary" size="sm" onClick={accept} loading={applying}>
          {anyKept ? "Apply and save" : "Save the note"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
          Not now
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Objection coach                                                     */
/* ------------------------------------------------------------------ */

/**
 * Rebuttals drawn from this team's own converted leads rather than a generic
 * script. It says which it used, because "grounded in your history" and
 * "plausible-sounding advice" deserve different amounts of trust.
 */
export function ObjectionCoach({ leadId }: { leadId: string }) {
  const enabled = useAiEnabled();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [objection, setObjection] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<{ rebuttals: Array<{ angle: string; say: string }>; grounded: boolean } | null>(
    null,
  );

  if (!enabled) return null;

  function ask() {
    if (objection.trim().length < 4) return;
    startTransition(async () => {
      const response = await coachObjectionAction({ leadId, objection: objection.trim() });
      if (!response.ok) {
        toast({ title: "No coaching right now", description: response.error, tone: "info" });
        return;
      }
      setResult(response.data ?? null);
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="subtle" size="sm" onClick={() => setOpen(true)}>
        <Lightbulb />
        They objected
      </Button>
    );
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-line bg-inset p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-body">What did they say?</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
          aria-label="Close the coach"
          className="grid size-6 place-items-center rounded-md text-subtle transition-colors hover:bg-surface hover:text-strong"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex gap-2">
        <Input
          value={objection}
          onChange={(e) => setObjection(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="We already have a receptionist"
          className="h-8"
          autoFocus
        />
        <Button type="button" variant="secondary" size="sm" onClick={ask} loading={pending} className="shrink-0">
          Ask
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          <Badge tone={result.grounded ? "success" : "neutral"} size="xs">
            {result.grounded ? "from leads you actually won" : "general reasoning — no matching history yet"}
          </Badge>
          {result.rebuttals.map((rebuttal, i) => (
            <div key={i} className="rounded-lg bg-surface p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{rebuttal.angle}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-body">{rebuttal.say}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
