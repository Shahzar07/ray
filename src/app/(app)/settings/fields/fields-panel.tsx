"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Pencil, Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { archiveCustomField, restoreCustomField, upsertCustomField } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";

import { APP_SHORT_NAME } from "@/lib/domain/constants";
type FieldType = "text" | "number" | "date" | "select" | "multiselect" | "boolean";

export type CustomField = {
  id: string;
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  sortOrder: number;
  isActive: boolean;
};

const FIELD_TYPE: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  multiselect: "Multi-select",
  boolean: "Yes / no",
};

const NEEDS_OPTIONS: FieldType[] = ["select", "multiselect"];

export function FieldsPanel({ fields }: { fields: CustomField[] }) {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<CustomField | "new" | null>(null);
  const [pending, startTransition] = React.useTransition();

  const active = fields.filter((f) => f.isActive);
  const archived = fields.filter((f) => !f.isActive);

  function move(field: CustomField, direction: -1 | 1) {
    const index = active.findIndex((f) => f.id === field.id);
    const swap = active[index + direction];
    if (!swap) return;
    startTransition(async () => {
      // Two writes, because sortOrder is the only thing that decides the order.
      await upsertCustomField({ ...field, sortOrder: swap.sortOrder });
      const result = await upsertCustomField({ ...swap, sortOrder: field.sortOrder });
      if (!result.ok) toast({ title: "Could not reorder", description: result.error, tone: "danger" });
    });
  }

  function setArchived(field: CustomField, archive: boolean) {
    startTransition(async () => {
      const result = archive ? await archiveCustomField(field.id) : await restoreCustomField(field.id);
      toast(
        result.ok
          ? { title: archive ? `${field.label} archived` : `${field.label} is back`, tone: "success" }
          : { title: "Could not do that", description: result.error, tone: "danger" },
      );
    });
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Custom fields</CardTitle>
            <CardDescription>
              Anything this business tracks that {APP_SHORT_NAME} does not ship with. New fields appear immediately as import
              targets and on the lead drawer.
            </CardDescription>
          </div>
          <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
            <Plus />
            Add field
          </Button>
        </CardHeader>

        {active.length === 0 ? (
          <div className="border-t border-line p-5">
            <EmptyState
              compact
              icon={<Tags />}
              title="No custom fields yet"
              description="Add one for the things your callers keep writing in notes — clinic size, software they use, who the gatekeeper is."
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)] border-t border-line">
            {active.map((field, index) => (
              <li key={field.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(field, -1)}
                    disabled={index === 0 || pending}
                    aria-label={`Move ${field.label} up`}
                    className="grid size-5 place-items-center rounded text-subtle transition-colors hover:bg-inset hover:text-strong disabled:opacity-30"
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(field, 1)}
                    disabled={index === active.length - 1 || pending}
                    aria-label={`Move ${field.label} down`}
                    className="grid size-5 place-items-center rounded text-subtle transition-colors hover:bg-inset hover:text-strong disabled:opacity-30"
                  >
                    <ArrowDown className="size-3" />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-strong">{field.label}</p>
                  <p className="truncate font-mono text-[11.5px] text-subtle">{field.key}</p>
                </div>

                <Badge tone="neutral" size="xs">
                  {FIELD_TYPE[field.fieldType]}
                </Badge>

                {field.options.length > 0 && (
                  <span className="hidden max-w-[280px] truncate text-[12px] text-muted sm:inline">
                    {field.options.join(" · ")}
                  </span>
                )}

                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${field.label}`} onClick={() => setEditing(field)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Archive ${field.label}`}
                  onClick={() => setArchived(field, true)}
                >
                  <Archive />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <div className="border-t border-line bg-sunken px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              Archived — hidden everywhere, data kept
            </p>
            <ul className="space-y-1.5">
              {archived.map((field) => (
                <li key={field.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{field.label}</span>
                  <Button variant="ghost" size="xs" onClick={() => setArchived(field, false)}>
                    <ArchiveRestore />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {editing && (
        <FieldDialog
          field={editing === "new" ? null : editing}
          nextSortOrder={active.length}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function FieldDialog({
  field,
  nextSortOrder,
  onClose,
}: {
  field: CustomField | null;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [type, setType] = React.useState<FieldType>(field?.fieldType ?? "text");
  const [label, setLabel] = React.useState(field?.label ?? "");
  const [key, setKey] = React.useState(field?.key ?? "");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  /* The key is the jsonb property name, so it is generated once from the
     label and then frozen — renaming it would orphan every stored value. */
  const keyLocked = Boolean(field);
  React.useEffect(() => {
    if (keyLocked) return;
    setKey(
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/^([0-9])/, "f$1")
        .slice(0, 40),
    );
  }, [label, keyLocked]);

  function submit(formData: FormData) {
    const options = String(formData.get("options") ?? "")
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 40);

    startTransition(async () => {
      const result = await upsertCustomField({
        id: field?.id,
        key,
        label: label.trim(),
        fieldType: type,
        options: NEEDS_OPTIONS.includes(type) ? options : [],
        sortOrder: field?.sortOrder ?? nextSortOrder,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ title: "Not saved", description: result.error, tone: "danger" });
        return;
      }
      toast({ title: field ? `${label} updated` : `${label} added`, tone: "success" });
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={field ? `Edit “${field.label}”` : "New custom field"}
        description="Shows up on every lead, in the importer, and in the lead drawer."
        className="max-w-[460px]"
      >
        <form action={submit}>
          <DialogBody>
            <Field label="Label" htmlFor="label" error={errors.label?.[0]}>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                autoFocus
                maxLength={60}
                placeholder="Clinic size"
              />
            </Field>

            <Field
              label="Key"
              hint={keyLocked ? "fixed once created" : "generated from the label"}
              htmlFor="key"
              error={errors.key?.[0]}
            >
              <Input
                id="key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                readOnly={keyLocked}
                required
                className={cn("font-mono text-[12.5px]", keyLocked && "opacity-60")}
              />
            </Field>

            <Field label="Type" htmlFor="type">
              <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE) as FieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {NEEDS_OPTIONS.includes(type) && (
              <Field label="Options" hint="one per line" htmlFor="options">
                <Textarea
                  id="options"
                  name="options"
                  defaultValue={field?.options.join("\n")}
                  placeholder={"1–3 chairs\n4–8 chairs\n9+ chairs"}
                  className="min-h-[110px] font-mono text-[12.5px]"
                />
              </Field>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {field ? "Save changes" : "Add field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
