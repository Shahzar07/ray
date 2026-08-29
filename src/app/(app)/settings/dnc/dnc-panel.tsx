"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListPlus, PhoneOff, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { addToDnc, bulkAddToDnc, removeFromDnc } from "@/lib/actions/leads";
import { formatPhone } from "@/lib/domain/phone";
import { fmtDate } from "@/lib/domain/dates";

export type DncRow = {
  id: string;
  phone: string;
  reason: string | null;
  addedBy: string | null;
  createdAt: string;
  matchedLeads: number;
};

export function DncPanel({
  entries,
  total,
  search,
  timezone,
}: {
  entries: DncRow[];
  total: number;
  search: string;
  timezone: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [term, setTerm] = React.useState(search);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (term.trim()) next.set("q", term.trim());
      else next.delete("q");
      const query = next.toString();
      router.replace(`/settings/dnc${query ? `?${query}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
    // `params` is a fresh object each render; the search term is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  function add(formData: FormData) {
    startTransition(async () => {
      const result = await addToDnc({
        phone: String(formData.get("phone") ?? ""),
        reason: String(formData.get("reason") ?? "") || undefined,
      });
      if (!result.ok) {
        toast({ title: "Not added", description: result.error, tone: "danger" });
        return;
      }
      toast({
        title: "Added to do-not-call",
        description: "Any lead with that number is now marked and out of every queue.",
        tone: "success",
      });
      router.refresh();
    });
  }

  function remove(entry: DncRow) {
    startTransition(async () => {
      const result = await removeFromDnc(entry.id);
      if (!result.ok) {
        toast({ title: "Not removed", description: result.error, tone: "danger" });
        return;
      }
      toast({
        title: `${formatPhone(entry.phone)} removed`,
        description: "Leads already marked do-not-call keep that status until someone changes it.",
        tone: "info",
      });
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Add a number</CardTitle>
            <CardDescription>
              Enforced across the whole org: every matching lead is marked do-not-call immediately and drops out of
              Call Mode, Today and the board.
            </CardDescription>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setBulkOpen(true)}>
            <ListPlus />
            Paste a list
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <form action={add} className="flex flex-wrap items-end gap-3">
            <Field label="Phone number" className="min-w-[200px] flex-1">
              <Input name="phone" required placeholder="0300 1234567" inputMode="tel" />
            </Field>
            <Field label="Reason" hint="Optional" className="min-w-[200px] flex-1">
              <Input name="reason" placeholder="Asked not to be called again" maxLength={300} />
            </Field>
            <Button type="submit" variant="primary" loading={pending}>
              <Plus />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Do-not-call list</CardTitle>
            <CardDescription>
              {total.toLocaleString()} {total === 1 ? "number" : "numbers"} across the org.
            </CardDescription>
          </div>
          <div className="relative w-full max-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search numbers"
              className="h-8 pl-8"
              aria-label="Search the do-not-call list"
            />
          </div>
        </CardHeader>

        {entries.length === 0 ? (
          <div className="border-t border-line p-5">
            <EmptyState
              compact
              icon={<PhoneOff />}
              title={search ? "Nothing matches that" : "The list is empty"}
              description={
                search
                  ? "Try a different number."
                  : "Add a number here — or mark a lead do-not-call while calling and it lands here automatically."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)] border-t border-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="font-mono text-[13px] text-strong">{formatPhone(entry.phone)}</span>
                {entry.matchedLeads > 0 && (
                  <Badge tone="warning" size="xs">
                    {entry.matchedLeads} {entry.matchedLeads === 1 ? "lead" : "leads"} blocked
                  </Badge>
                )}
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{entry.reason ?? "—"}</span>
                <span className="hidden text-[11.5px] text-subtle sm:inline">
                  {entry.addedBy ?? "someone"} · {fmtDate(entry.createdAt, timezone)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${entry.phone}`}
                  className="text-danger-text"
                  onClick={() => remove(entry)}
                  disabled={pending}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <BulkDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </>
  );
}

function BulkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [unreadable, setUnreadable] = React.useState<string[]>([]);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await bulkAddToDnc({
        text: String(formData.get("text") ?? ""),
        reason: String(formData.get("reason") ?? "") || undefined,
      });
      if (!result.ok) {
        toast({ title: "Nothing added", description: result.error, tone: "danger" });
        return;
      }
      const data = result.data!;
      setUnreadable(data.unreadable);
      toast({
        title: `${data.added} ${data.added === 1 ? "number" : "numbers"} added`,
        description:
          data.alreadyThere > 0 ? `${data.alreadyThere} were already on the list.` : undefined,
        tone: "success",
      });
      router.refresh();
      if (data.unreadable.length === 0) onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setUnreadable([]);
      }}
    >
      <DialogContent
        title="Paste a do-not-call list"
        description="One number per line, or comma-separated. Any format — they are normalised on the way in."
        className="max-w-[480px]"
      >
        <form action={submit}>
          <DialogBody>
            <Field label="Numbers" htmlFor="dnc-text">
              <Textarea
                id="dnc-text"
                name="text"
                required
                autoFocus
                placeholder={"0300 1234567\n+92 321 4445566\n03331112233"}
                className="min-h-[160px] font-mono text-[12.5px]"
              />
            </Field>
            <Field label="Reason for all of them" hint="Optional" htmlFor="dnc-reason">
              <Input id="dnc-reason" name="reason" placeholder="Regulator list, Aug 2026" maxLength={300} />
            </Field>
            {unreadable.length > 0 && (
              <div className="rounded-lg bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning-text">
                <p className="font-medium">These lines were not phone numbers and were left out:</p>
                <p className="mt-1 font-mono">{unreadable.join(", ")}</p>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              <ListPlus />
              Add them all
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
