"use client";

import * as React from "react";
import { Check, Copy, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { draftFollowUpAction } from "@/lib/actions/ai";
import { useAiEnabled } from "@/lib/hooks/use-ai";
import { whatsAppHref } from "@/lib/domain/phone";
import { cn } from "@/lib/utils";

/**
 * Drafts a WhatsApp or email follow-up from the lead's own notes and trial day.
 * The caller edits it before it goes anywhere — WhatsApp opens with the text
 * pre-filled via wa.me, and nothing is sent from the app itself.
 */
export function DraftFollowUp({
  leadId,
  phone,
  className,
}: {
  leadId: string;
  phone: string;
  className?: string;
}) {
  const enabled = useAiEnabled();
  const { toast } = useToast();
  const [channel, setChannel] = React.useState<"whatsapp" | "email">("whatsapp");
  const [message, setMessage] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (!enabled) return null;

  function draft(next: "whatsapp" | "email" = channel) {
    setChannel(next);
    startTransition(async () => {
      const result = await draftFollowUpAction({ leadId, channel: next });
      if (!result.ok) {
        toast({ title: "No draft right now", description: result.error, tone: "info" });
        return;
      }
      setMessage(result.data?.message ?? "");
      setOpen(true);
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Clipboard blocked", description: "Select the text and copy it by hand.", tone: "warning" });
    }
  }

  if (!open) {
    return (
      <Button variant="subtle" size="sm" onClick={() => draft("whatsapp")} loading={pending} className={className}>
        <MessageSquareText />
        Draft a follow-up
      </Button>
    );
  }

  return (
    <div className={cn("space-y-2.5 rounded-xl border border-line bg-inset p-3", className)}>
      <div className="flex items-center gap-1 rounded-lg bg-surface p-0.5">
        {(["whatsapp", "email"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => draft(option)}
            aria-pressed={channel === option}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-[12px] font-medium capitalize transition-colors",
              channel === option ? "bg-inset text-strong" : "text-muted hover:text-strong",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="min-h-[110px] text-[13px]"
        aria-label="Draft message"
      />
      <p className="text-[11px] text-subtle">Edit it before you send — it is a draft, not a send button.</p>

      <div className="flex flex-wrap gap-2">
        {channel === "whatsapp" ? (
          <Button variant="primary" size="sm" asChild disabled={!message.trim()}>
            <a href={whatsAppHref(phone, message)} target="_blank" rel="noreferrer">
              <Send />
              Open WhatsApp
            </a>
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={copy} disabled={!message.trim()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy email"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => draft()} loading={pending}>
          <RefreshCw />
          Redraft
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="ml-auto">
          Close
        </Button>
      </div>
    </div>
  );
}
