"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardPaste,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Table2,
  Upload,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import {
  Avatar,
  Checkbox,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { LEAD_SOURCE } from "@/lib/domain/constants";
import {
  ASSIGNMENT_STRATEGY,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  VERDICT_META,
  autoDetectMapping,
  type AssignmentStrategy,
  type DncAction,
  type DuplicateAction,
  type ImportPreview,
  type MappingTarget,
  type RowVerdict,
} from "@/lib/domain/import";
import { previewImport, runImport, undoImportBatch, type ImportSummary } from "@/lib/actions/import";
import { ACCEPTED_EXTENSIONS, parseSheetFile, parsePastedSheet, type Sheet } from "./parse-sheet";

export type ImportMember = { id: string; name: string | null; email: string; avatarUrl: string | null };
export type CustomFieldOption = { key: string; label: string };

const MAPPING_STORAGE_KEY = "calldesk:import-mapping";
const STAGES = ["Upload", "Map columns", "Review", "Done"] as const;
type Stage = 0 | 1 | 2 | 3;

export function ImportWizard({
  members,
  customFields,
  currentUserId,
}: {
  members: ImportMember[];
  customFields: CustomFieldOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [stage, setStage] = React.useState<Stage>(0);
  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const [mapping, setMapping] = React.useState<MappingTarget[]>([]);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [pending, startTransition] = React.useTransition();

  /* Batch-level options */
  const [source, setSource] = React.useState("scraped");
  const [sourceNote, setSourceNote] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [strategy, setStrategy] = React.useState<AssignmentStrategy>("single");
  const [assignUserIds, setAssignUserIds] = React.useState<string[]>([currentUserId]);
  const [duplicateAction, setDuplicateAction] = React.useState<DuplicateAction>("skip");
  const [dncAction, setDncAction] = React.useState<DncAction>("skip");

  const customKeys = React.useMemo(() => customFields.map((f) => f.key), [customFields]);

  /** Remembered per user so the second sheet from the same scraper maps itself. */
  const loadSheet = React.useCallback(
    (next: Sheet) => {
      if (next.headers.length === 0) {
        toast({ title: "Nothing to import", description: "That file has no header row.", tone: "danger" });
        return;
      }
      let detected = autoDetectMapping(next.headers, customKeys);
      try {
        const saved = JSON.parse(localStorage.getItem(MAPPING_STORAGE_KEY) ?? "{}") as Record<string, string>;
        const remembered = next.headers.map((header, i) => saved[header] ?? detected[i] ?? null);
        // A remembered target must still be unique across columns.
        const seen = new Set<string>();
        detected = remembered.map((target) => {
          if (!target || seen.has(target)) return null;
          seen.add(target);
          return target;
        });
      } catch {
        /* A corrupt cache is not worth a broken import. */
      }
      setSheet(next);
      setMapping(detected);
      setPreview(null);
      setStage(1);
      if (next.overflow > 0) {
        toast({
          title: `Only the first ${MAX_IMPORT_ROWS.toLocaleString()} rows loaded`,
          description: `${next.overflow.toLocaleString()} more rows are waiting — import them as a second batch.`,
          tone: "warning",
        });
      }
    },
    [customKeys, toast],
  );

  const requiredMissing = React.useMemo(
    () => IMPORT_FIELDS.filter((f) => f.required && !mapping.includes(f.key)).map((f) => f.label),
    [mapping],
  );

  function goToReview() {
    if (!sheet || requiredMissing.length > 0) return;
    try {
      const saved: Record<string, string> = {};
      sheet.headers.forEach((header, i) => {
        const target = mapping[i];
        if (target) saved[header] = target;
      });
      localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* Private browsing — the mapping just won't be remembered. */
    }

    startTransition(async () => {
      const result = await previewImport({ headers: sheet.headers, rows: sheet.rows, mapping });
      if (!result.ok) {
        toast({ title: "Could not check that sheet", description: result.error, tone: "danger" });
        return;
      }
      setPreview(result.data ?? null);
      setStage(2);
    });
  }

  function commit() {
    if (!sheet) return;
    startTransition(async () => {
      const result = await runImport({
        headers: sheet.headers,
        rows: sheet.rows,
        mapping,
        filename: sheet.filename,
        source,
        sourceNote: sourceNote.trim() || undefined,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
        strategy,
        assignUserIds: strategy === "by_column" && assignUserIds.length === 0 ? [currentUserId] : assignUserIds,
        duplicateAction,
        dncAction,
      });
      if (!result.ok) {
        toast({ title: "Import failed", description: result.error, tone: "danger" });
        return;
      }
      setSummary(result.data ?? null);
      setStage(3);
      router.refresh();
    });
  }

  function reset() {
    setSheet(null);
    setMapping([]);
    setPreview(null);
    setSummary(null);
    setStage(0);
  }

  return (
    <div className="space-y-5">
      <StageRail stage={stage} />

      {stage === 0 && <UploadStep onSheet={loadSheet} />}

      {stage === 1 && sheet && (
        <MapStep
          sheet={sheet}
          mapping={mapping}
          setMapping={setMapping}
          customFields={customFields}
          requiredMissing={requiredMissing}
          members={members}
          source={source}
          setSource={setSource}
          sourceNote={sourceNote}
          setSourceNote={setSourceNote}
          tagsInput={tagsInput}
          setTagsInput={setTagsInput}
          strategy={strategy}
          setStrategy={setStrategy}
          assignUserIds={assignUserIds}
          setAssignUserIds={setAssignUserIds}
          onBack={reset}
          onNext={goToReview}
          pending={pending}
        />
      )}

      {stage === 2 && preview && (
        <ReviewStep
          preview={preview}
          duplicateAction={duplicateAction}
          setDuplicateAction={setDuplicateAction}
          dncAction={dncAction}
          setDncAction={setDncAction}
          onBack={() => setStage(1)}
          onCommit={commit}
          pending={pending}
        />
      )}

      {stage === 3 && summary && <DoneStep summary={summary} onAnother={reset} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stage rail                                                          */
/* ------------------------------------------------------------------ */

function StageRail({ stage }: { stage: Stage }) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Import progress">
      {STAGES.map((label, i) => {
        const done = i < stage;
        const active = i === stage;
        return (
          <li key={label} className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                active && "bg-accent-soft text-accent-text",
                done && "text-muted",
                !active && !done && "text-subtle",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[10.5px] font-semibold ring-1 ring-inset",
                  active && "bg-accent text-accent-fg ring-transparent",
                  done && "bg-success text-white ring-transparent",
                  !active && !done && "bg-inset text-subtle ring-line",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {label}
            </span>
            {i < STAGES.length - 1 && <span className="h-px w-4 bg-line sm:w-8" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* 1 — Upload                                                          */
/* ------------------------------------------------------------------ */

function UploadStep({ onSheet }: { onSheet: (sheet: Sheet) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<"file" | "paste">("file");
  const [dragging, setDragging] = React.useState(false);
  const [pasted, setPasted] = React.useState("");
  const [reading, setReading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      onSheet(await parseSheetFile(file));
    } catch (error) {
      toast({
        title: "Could not read that file",
        description: error instanceof Error ? error.message : "Try exporting it as CSV.",
        tone: "danger",
      });
    } finally {
      setReading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Bring in a scraped sheet</CardTitle>
          <CardDescription>
            CSV or Excel, or paste the cells straight out of Google Sheets. Numbers are normalised and checked
            against your existing leads before anything is written.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg bg-inset p-1">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
              mode === "file" ? "bg-surface text-strong shadow-xs" : "text-muted hover:text-strong",
            )}
          >
            <FileSpreadsheet className="size-3.5" />
            File
          </button>
          <button
            type="button"
            onClick={() => setMode("paste")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
              mode === "paste" ? "bg-surface text-strong shadow-xs" : "text-muted hover:text-strong",
            )}
          >
            <ClipboardPaste className="size-3.5" />
            Paste
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {mode === "file" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
              dragging ? "border-accent bg-accent-soft" : "border-line bg-sunken",
            )}
          >
            <div className="grid size-12 place-items-center rounded-xl bg-surface text-accent shadow-xs">
              {reading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            </div>
            <p className="mt-3 text-[14px] font-semibold text-strong">
              {reading ? "Reading the sheet…" : "Drop your sheet here"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              .csv, .tsv or .xlsx — up to {MAX_IMPORT_ROWS.toLocaleString()} rows per import
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="sr-only"
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="md" className="mt-4" onClick={() => inputRef.current?.click()} disabled={reading}>
              Choose a file
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Field
              label="Paste your cells"
              hint="Include the header row"
              htmlFor="paste"
            >
              <Textarea
                id="paste"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"Name\tCompany\tPhone\nAhmed Khan\tCrescent Dental\t0300 1234567"}
                className="min-h-[180px] font-mono text-[12.5px]"
              />
            </Field>
            <Button
              variant="primary"
              disabled={!pasted.trim()}
              onClick={() => {
                const sheet = parsePastedSheet(pasted);
                if (sheet.rows.length === 0) {
                  toast({ title: "Nothing to import", description: "Paste a header row and at least one lead.", tone: "danger" });
                  return;
                }
                onSheet(sheet);
              }}
            >
              <Table2 />
              Read {pasted.trim() ? `${Math.max(0, pasted.trim().split("\n").length - 1)} rows` : "these rows"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 2 — Map columns                                                     */
/* ------------------------------------------------------------------ */

const UNMAPPED = "__skip__";

function MapStep(props: {
  sheet: Sheet;
  mapping: MappingTarget[];
  setMapping: (m: MappingTarget[]) => void;
  customFields: CustomFieldOption[];
  requiredMissing: string[];
  members: ImportMember[];
  source: string;
  setSource: (v: string) => void;
  sourceNote: string;
  setSourceNote: (v: string) => void;
  tagsInput: string;
  setTagsInput: (v: string) => void;
  strategy: AssignmentStrategy;
  setStrategy: (v: AssignmentStrategy) => void;
  assignUserIds: string[];
  setAssignUserIds: (v: string[]) => void;
  onBack: () => void;
  onNext: () => void;
  pending: boolean;
}) {
  const { sheet, mapping, setMapping, customFields, requiredMissing, members } = props;

  function setColumn(index: number, target: string) {
    const next = [...mapping];
    const value = target === UNMAPPED ? null : target;
    // One sheet column per field — claiming a field releases it elsewhere.
    if (value) next.forEach((t, i) => (next[i] = t === value && i !== index ? null : t));
    next[index] = value;
    setMapping(next);
  }

  const assigneeMapped = mapping.includes("assignee");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Match your columns</CardTitle>
            <CardDescription>
              {sheet.headers.length} columns · {sheet.rows.length.toLocaleString()} rows from{" "}
              <span className="font-medium text-body">{sheet.filename}</span>. We remember this mapping for next time.
            </CardDescription>
          </div>
        </CardHeader>
        <div className="border-t border-line">
          <div className="hidden items-center gap-3 border-b border-line bg-sunken px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle sm:flex">
            <span className="flex-1">Column in your sheet</span>
            <span className="w-[188px]">Imports as</span>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {sheet.headers.map((header, index) => {
              const samples = sheet.rows
                .slice(0, 3)
                .map((r) => r[index])
                .filter((v): v is string => Boolean(v));
              const target = mapping[index] ?? null;
              return (
                <li key={`${header}-${index}`} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[13.5px] font-medium", target ? "text-strong" : "text-muted")}>
                      {header}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-subtle">
                      {samples.length > 0 ? samples.join(" · ") : "No values in the first rows"}
                    </p>
                  </div>
                  <Select value={target ?? UNMAPPED} onValueChange={(v) => setColumn(index, v)}>
                    <SelectTrigger size="sm" className="w-full sm:w-[188px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNMAPPED}>Don&rsquo;t import</SelectItem>
                      <SelectGroup>
                        <SelectLabel>Lead fields</SelectLabel>
                        {IMPORT_FIELDS.map((field) => (
                          <SelectItem key={field.key} value={field.key}>
                            {field.label}
                            {field.required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {customFields.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Custom fields</SelectLabel>
                          {customFields.map((field) => (
                            <SelectItem key={field.key} value={`custom:${field.key}`}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Batch details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Source">
              <Select value={props.source} onValueChange={props.setSource}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_SOURCE).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tag every lead" hint="Optional" htmlFor="tags">
              <Input
                id="tags"
                value={props.tagsInput}
                onChange={(e) => props.setTagsInput(e.target.value)}
                placeholder="dentists, karachi"
                className="h-8"
              />
            </Field>
            <Field label="Note about this sheet" hint="Optional" htmlFor="note">
              <Input
                id="note"
                value={props.sourceNote}
                onChange={(e) => props.setSourceNote(e.target.value)}
                placeholder="Maps scrape, 12 Aug"
                className="h-8"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who calls them</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              {(Object.keys(ASSIGNMENT_STRATEGY) as AssignmentStrategy[]).map((key) => {
                const meta = ASSIGNMENT_STRATEGY[key];
                const disabled = key === "by_column" && !assigneeMapped;
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                      props.strategy === key ? "border-accent bg-accent-soft" : "border-line hover:bg-inset",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      className="mt-0.5 accent-[var(--accent)]"
                      checked={props.strategy === key}
                      disabled={disabled}
                      onChange={() => props.setStrategy(key)}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-strong">{meta.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                        {disabled ? "Map a column to “Assign to” first." : meta.blurb}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {props.strategy !== "by_column" && (
              <>
                <Separator />
                <div className="space-y-1">
                  <Label>{props.strategy === "single" ? "Assign every lead to" : "Deal out between"}</Label>
                  <div className="max-h-52 space-y-0.5 overflow-y-auto pt-1">
                    {members.map((m) => {
                      const checked = props.assignUserIds.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-inset"
                        >
                          {props.strategy === "single" ? (
                            <input
                              type="radio"
                              name="assignee"
                              className="accent-[var(--accent)]"
                              checked={checked}
                              onChange={() => props.setAssignUserIds([m.id])}
                            />
                          ) : (
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                props.setAssignUserIds(
                                  value ? [...props.assignUserIds, m.id] : props.assignUserIds.filter((id) => id !== m.id),
                                )
                              }
                            />
                          )}
                          <Avatar name={m.name} src={m.avatarUrl} size="xs" />
                          <span className="truncate text-[13px] text-body">{m.name ?? m.email}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {requiredMissing.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-[12.5px] leading-snug text-warning-text">
              Still need a column for <strong>{requiredMissing.join(" and ")}</strong>. Without them there is nothing
              to dial.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={props.onBack} className="flex-1">
            <ArrowLeft />
            Start over
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={props.onNext}
            disabled={requiredMissing.length > 0}
            loading={props.pending}
          >
            Check {sheet.rows.length.toLocaleString()} rows
            <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3 — Review                                                          */
/* ------------------------------------------------------------------ */

const GROUP_ORDER: RowVerdict[] = ["ready", "duplicate", "dnc", "duplicate_in_file", "invalid"];

function ReviewStep(props: {
  preview: ImportPreview;
  duplicateAction: DuplicateAction;
  setDuplicateAction: (v: DuplicateAction) => void;
  dncAction: DncAction;
  setDncAction: (v: DncAction) => void;
  onBack: () => void;
  onCommit: () => void;
  pending: boolean;
}) {
  const { preview } = props;
  const [filter, setFilter] = React.useState<RowVerdict | "all">("all");

  const willCreate =
    preview.counts.ready + (props.dncAction === "import_flagged" ? preview.counts.dnc : 0);
  const willUpdate = props.duplicateAction === "update" ? preview.counts.duplicate : 0;
  const visible = filter === "all" ? preview.rows : preview.rows.filter((r) => r.verdict === filter);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {GROUP_ORDER.map((verdict) => {
          const meta = VERDICT_META[verdict];
          const count = preview.counts[verdict];
          const active = filter === verdict;
          return (
            <button
              key={verdict}
              type="button"
              onClick={() => setFilter(active ? "all" : verdict)}
              disabled={count === 0}
              className={cn(
                "rounded-xl border p-3.5 text-left transition-colors disabled:opacity-45",
                active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-inset",
                count === 0 && "hover:bg-surface",
              )}
            >
              <div className="flex items-center gap-2">
                <Badge tone={meta.tone} size="xs" dot>
                  {meta.label}
                </Badge>
              </div>
              <p className="stat-value mt-2 text-[24px] font-semibold leading-none tracking-tight text-strong">
                {count.toLocaleString()}
              </p>
              <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{meta.blurb}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>{filter === "all" ? "Every row" : VERDICT_META[filter].label}</CardTitle>
              <CardDescription>
                {preview.truncated
                  ? `A sample of each group — all ${preview.totalRows.toLocaleString()} rows will be processed.`
                  : `${preview.totalRows.toLocaleString()} rows checked.`}
              </CardDescription>
            </div>
            {filter !== "all" && (
              <Button variant="ghost" size="xs" onClick={() => setFilter("all")}>
                Show all
              </Button>
            )}
          </CardHeader>
          <div className="max-h-[440px] overflow-auto border-t border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-sunken">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Phone</th>
                  <th className="px-3 py-2 font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {visible.map((row) => (
                  <tr key={row.row} className="hover:bg-inset">
                    <td className="px-3 py-2 tabular-nums text-subtle">{row.row}</td>
                    <td className="max-w-[220px] px-3 py-2">
                      <p className="truncate font-medium text-strong">{row.fullName}</p>
                      {row.company && <p className="truncate text-[12px] text-muted">{row.company}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[12px] text-body">{row.phoneE164 ?? (row.phoneRaw || "—")}</span>
                      {row.phoneE164 && row.phoneE164 !== row.phoneRaw && (
                        <span className="ml-1.5 text-[11px] text-subtle line-through">{row.phoneRaw}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={VERDICT_META[row.verdict].tone} size="xs">
                          {VERDICT_META[row.verdict].label}
                        </Badge>
                        {row.reason && <span className="text-[11.5px] text-muted">{row.reason}</span>}
                        {row.verdict === "duplicate" && (
                          <span className="text-[11.5px] text-muted">
                            held by {row.existingAssignee ?? "nobody"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10">
                      <EmptyState compact title="Nothing in this group" description="Pick another group above." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Decide the edge cases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ChoiceGroup
                label={`${preview.counts.duplicate} already in CallDesk`}
                disabled={preview.counts.duplicate === 0}
                value={props.duplicateAction}
                onChange={(v) => props.setDuplicateAction(v as DuplicateAction)}
                options={[
                  { value: "skip", label: "Leave them alone", blurb: "The existing lead and its history are untouched." },
                  {
                    value: "update",
                    label: "Fill in missing details",
                    blurb: "Adds company, email and city where the lead has none. Never overwrites what a caller set.",
                  },
                ]}
              />
              <Separator />
              <ChoiceGroup
                label={`${preview.counts.dnc} on the do-not-call list`}
                disabled={preview.counts.dnc === 0}
                value={props.dncAction}
                onChange={(v) => props.setDncAction(v as DncAction)}
                options={[
                  { value: "skip", label: "Don't import them", blurb: "Recommended — they stay out of every queue." },
                  {
                    value: "import_flagged",
                    label: "Import as do-not-call",
                    blurb: "Creates the lead for the record, marked do-not-call so nobody dials it.",
                  },
                ]}
              />
              {preview.counts.invalid > 0 && (
                <>
                  <Separator />
                  <p className="text-[12px] leading-snug text-muted">
                    <strong className="text-body">
                      {preview.counts.invalid} {preview.counts.invalid === 1 ? "row" : "rows"} can&rsquo;t be imported
                    </strong>{" "}
                    — no readable name or number. They&rsquo;re listed against the batch afterwards so you can fix the
                    sheet.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-5">
              <SummaryLine label="New leads created" value={willCreate} tone="success" />
              <SummaryLine label="Existing leads updated" value={willUpdate} tone="info" />
              <SummaryLine
                label="Rows skipped"
                value={preview.totalRows - willCreate - willUpdate}
                tone="neutral"
              />
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={props.onBack} className="flex-1">
              <ArrowLeft />
              Back
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={props.onCommit}
              loading={props.pending}
              disabled={willCreate + willUpdate === 0}
            >
              Import
              <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoiceGroup({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; blurb: string }>;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className={cn(disabled && "opacity-45")}>
      <legend className="mb-1.5 text-[12.5px] font-medium text-body">{label}</legend>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
              value === option.value ? "border-accent bg-accent-soft" : "border-line hover:bg-inset",
              disabled && "cursor-not-allowed",
            )}
          >
            <input
              type="radio"
              className="mt-0.5 accent-[var(--accent)]"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-strong">{option.label}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted">{option.blurb}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SummaryLine({ label, value, tone }: { label: string; value: number; tone: "success" | "info" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-muted">{label}</span>
      <Badge tone={tone} size="md" className="tabular-nums">
        {value.toLocaleString()}
      </Badge>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 — Done                                                            */
/* ------------------------------------------------------------------ */

function DoneStep({ summary, onAnother }: { summary: ImportSummary; onAnother: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [undone, setUndone] = React.useState(false);

  function undo() {
    startTransition(async () => {
      const result = await undoImportBatch(summary.batchId);
      if (!result.ok) {
        toast({ title: "Could not undo", description: result.error, tone: "danger" });
        return;
      }
      setUndone(true);
      toast({
        title: "Batch removed",
        description: `${result.data?.removed.toLocaleString() ?? 0} leads deleted.`,
        tone: "success",
      });
      router.refresh();
    });
  }

  if (undone) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={<RotateCcw />}
            title="That batch is gone"
            description="The leads it created were removed. Nothing else was touched."
            action={
              <Button variant="primary" onClick={onAnother}>
                Import another sheet
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="grid size-5 place-items-center rounded-full bg-success text-white">
              <Check className="size-3" strokeWidth={3} />
            </span>
            Import finished
          </CardTitle>
          <CardDescription>Everything below is live in the lead table.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Figure label="Created" value={summary.imported} tone="success" />
          <Figure label="Updated" value={summary.updated} tone="info" />
          <Figure label="Skipped" value={summary.skipped} tone="neutral" />
          <Figure label="Unusable rows" value={summary.invalid} tone={summary.invalid > 0 ? "warning" : "neutral"} />
        </div>

        {summary.assigned.length > 0 && (
          <div>
            <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-subtle">Dealt out to</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.assigned.map((row) => (
                <Badge key={row.name} tone="neutral" size="md">
                  {row.name}
                  <span className="font-semibold tabular-nums text-strong">{row.count}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="primary" asChild>
            <Link href={`/leads?batch=${summary.batchId}`}>
              See these leads
              <ArrowRight />
            </Link>
          </Button>
          <Button variant="secondary" onClick={onAnother}>
            <Upload />
            Import another
          </Button>
          <Button variant="ghost" onClick={undo} loading={pending} className="ml-auto text-danger-text">
            <Undo2 />
            Undo this import
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "info" | "neutral" | "warning";
}) {
  return (
    <div className="rounded-xl border border-line bg-sunken p-3.5">
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="stat-value mt-1.5 text-[24px] font-semibold leading-none tracking-tight text-strong">
        {value.toLocaleString()}
      </p>
      <div className="mt-2">
        <Badge tone={tone} size="xs" dot>
          {tone === "success" ? "new" : tone === "info" ? "enriched" : tone === "warning" ? "check the sheet" : "no change"}
        </Badge>
      </div>
    </div>
  );
}
