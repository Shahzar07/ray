"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, FileSpreadsheet, History, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { Hint } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { undoImportBatch } from "@/lib/actions/import";
import { ASSIGNMENT_STRATEGY, type AssignmentStrategy } from "@/lib/domain/import";
import { fmtDateTime, relative } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

export type HistoryBatch = {
  id: string;
  filename: string;
  uploadedBy: string | null;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
  assignmentStrategy: AssignmentStrategy;
  status: "pending" | "processing" | "done" | "failed";
  createdAt: string;
  liveLeads: number;
  undoable: boolean;
  errorLog: Array<{ row: number; message: string }>;
};

export function BatchHistory({ batches, timezone }: { batches: HistoryBatch[]; timezone: string }) {
  if (batches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Past imports</CardTitle>
            <CardDescription>Every sheet you bring in stays traceable.</CardDescription>
          </div>
        </CardHeader>
        <div className="border-t border-line p-5">
          <EmptyState
            compact
            icon={<History />}
            title="No imports yet"
            description="Once you bring a sheet in, it shows up here with its row counts — and can be undone while nobody has worked the leads."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Past imports</CardTitle>
          <CardDescription>
            Trace lead quality back to the sheet it came from, or undo a bad batch.
          </CardDescription>
        </div>
      </CardHeader>
      <ul className="divide-y divide-[var(--line)] border-t border-line">
        {batches.map((batch) => (
          <BatchRowItem key={batch.id} batch={batch} timezone={timezone} />
        ))}
      </ul>
    </Card>
  );
}

function BatchRowItem({ batch, timezone }: { batch: HistoryBatch; timezone: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [showErrors, setShowErrors] = React.useState(false);

  function undo() {
    startTransition(async () => {
      const result = await undoImportBatch(batch.id);
      if (!result.ok) {
        toast({ title: "Could not undo", description: result.error, tone: "danger" });
        return;
      }
      toast({
        title: `${batch.filename} removed`,
        description: `${result.data?.removed.toLocaleString() ?? 0} leads deleted.`,
        tone: "success",
      });
      router.refresh();
    });
  }

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-inset text-subtle">
          <FileSpreadsheet className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/leads?batch=${batch.id}`}
              className="truncate text-[13.5px] font-medium text-strong hover:text-accent-text hover:underline"
            >
              {batch.filename}
            </Link>
            {batch.status === "failed" && (
              <Badge tone="danger" size="xs">
                Failed
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            {batch.uploadedBy ?? "Someone"} · {relative(batch.createdAt)} ·{" "}
            <span title={fmtDateTime(batch.createdAt, timezone)}>
              {ASSIGNMENT_STRATEGY[batch.assignmentStrategy].label.toLowerCase()}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="success" size="xs">
              {batch.importedCount.toLocaleString()} imported
            </Badge>
            {batch.duplicateCount > 0 && (
              <Badge tone="warning" size="xs">
                {batch.duplicateCount.toLocaleString()} duplicates
              </Badge>
            )}
            {batch.errorCount > 0 && (
              <button
                type="button"
                onClick={() => setShowErrors((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger-text ring-1 ring-inset ring-danger/25 transition-colors hover:brightness-105"
              >
                {batch.errorCount.toLocaleString()} unusable
                <ChevronDown className={cn("size-3 transition-transform", showErrors && "rotate-180")} />
              </button>
            )}
            {batch.liveLeads !== batch.importedCount && (
              <Badge tone="neutral" size="xs">
                {batch.liveLeads.toLocaleString()} still live
              </Badge>
            )}
          </div>
        </div>

        {batch.undoable ? (
          <Button variant="ghost" size="sm" onClick={undo} loading={pending} className="shrink-0 text-danger-text">
            <Undo2 />
            Undo
          </Button>
        ) : (
          <Hint
            label={
              batch.liveLeads === 0
                ? "This batch has no leads left to remove."
                : "These leads have calls or notes on them now — undoing would delete that history."
            }
          >
            <span className="shrink-0 px-2 py-1 text-[12px] text-subtle">Locked</span>
          </Hint>
        )}
      </div>

      {showErrors && batch.errorLog.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-sunken p-3">
          {batch.errorLog.map((error) => (
            <li key={error.row} className="flex gap-2 text-[12px]">
              <span className="shrink-0 font-mono text-subtle">Row {error.row}</span>
              <span className="text-muted">{error.message}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
