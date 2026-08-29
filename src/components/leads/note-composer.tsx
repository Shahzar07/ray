"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { addNote } from "@/lib/actions/leads";
import { applyNoteSuggestion } from "@/lib/actions/ai";
import { useDictation } from "@/lib/hooks/use-dictation";
import { NoteAssist, type AcceptedSuggestion } from "@/components/ai/note-assist";

/**
 * Note box with browser dictation. Web Speech API is free and needs no
 * service; where it is missing the mic button simply does not render.
 */
export function NoteComposer({
  leadId,
  onSaved,
  placeholder = "What happened on the call?",
  compact,
}: {
  leadId: string;
  onSaved?: () => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const dictation = useDictation((text) => setValue((v) => (v ? `${v} ${text}` : text)));

  function submit() {
    const body = value.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await addNote({ leadId, body });
      if (result.ok) {
        setValue("");
        toast({ title: "Note saved", tone: "success" });
        onSaved?.();
        router.refresh();
      } else {
        toast({ title: "Not saved", description: result.error, tone: "danger" });
      }
    });
  }

  /* Everything the caller kept is written through the same guarded action a
     manual edit uses — the suggestion gets no shortcut into the database. */
  function applySuggestion(accepted: AcceptedSuggestion) {
    const body = value.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await applyNoteSuggestion({ leadId, note: body, ...accepted });
      if (result.ok) {
        setValue("");
        toast({ title: "Saved from your note", description: result.message, tone: "success" });
        onSaved?.();
        router.refresh();
      } else {
        toast({ title: "Not saved", description: result.error, tone: "danger" });
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          placeholder={placeholder}
          className={cn("pr-11", compact ? "min-h-[68px]" : "min-h-[92px]")}
          aria-label="Note"
        />
        {dictation.supported && (
          <button
            type="button"
            onClick={dictation.toggle}
            aria-label={dictation.listening ? "Stop dictation" : "Dictate a note"}
            aria-pressed={dictation.listening}
            className={cn(
              "absolute right-2 top-2 grid size-8 place-items-center rounded-lg transition-colors",
              dictation.listening
                ? "bg-danger text-white [animation:pulse-ring_1.6s_ease-out_infinite]"
                : "text-subtle hover:bg-inset hover:text-strong",
            )}
          >
            {dictation.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
        )}
      </div>

      <NoteAssist leadId={leadId} note={value} onAccept={applySuggestion} applying={pending} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-subtle">
          {dictation.listening ? (
            <span className="flex items-center gap-1.5 text-danger-text">
              <span className="size-1.5 animate-pulse rounded-full bg-danger" />
              Listening…
            </span>
          ) : (
            <>
              <kbd className="font-mono">⌘↵</kbd> to save
            </>
          )}
        </span>
        <Button variant="primary" size="sm" onClick={submit} loading={pending} disabled={!value.trim()}>
          <Send />
          Save note
        </Button>
      </div>
    </div>
  );
}

export function AiSuggestionChip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-accent-soft-line bg-accent-soft px-3 py-2 text-[12.5px] leading-relaxed text-accent-text">
      <Sparkles className="mt-0.5 size-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
