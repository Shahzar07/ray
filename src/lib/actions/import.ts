"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  activities,
  customFieldDefs,
  doNotCall,
  importBatches,
  leads,
  memberships,
  users,
  type LeadStatus,
  type NewLead,
} from "@/lib/db/schema";
import { requireSession, type SessionContext } from "@/lib/auth/session";
import { assertCanManageTeam, PermissionError } from "@/lib/auth/visibility";
import { normalisePhone } from "@/lib/domain/phone";
import {
  customKeyOf,
  isCustomTarget,
  IMPORT_FIELD_MAP,
  MAX_PREVIEW_ROWS,
  parseTags,
  type ImportFieldKey,
  type ImportPreview,
  type PreviewRow,
  type RowVerdict,
} from "@/lib/domain/import";
import { notify, recordActivities } from "./activity";
import { importPreviewSchema, runImportSchema } from "./schemas";
import type { ActionResult } from "./leads";

/* ------------------------------------------------------------------ */
/* Shared classification — preview and commit must never disagree      */
/* ------------------------------------------------------------------ */

type MappedRow = {
  /** 1-based row number in the user's sheet, header excluded. */
  row: number;
  fields: Partial<Record<ImportFieldKey, string>>;
  custom: Record<string, string>;
};

type ClassifiedRow = MappedRow & {
  verdict: RowVerdict;
  phoneE164: string | null;
  phoneRaw: string;
  reason?: string;
  existing?: { id: string; status: LeadStatus; assigneeName: string | null };
};

/** Turn raw cells + a mapping into named fields, dropping targets we never offered. */
function mapRows(
  headers: string[],
  rows: string[][],
  mapping: Array<string | null>,
  allowedCustomKeys: Set<string>,
): MappedRow[] {
  const targets = mapping.slice(0, headers.length).map((target) => {
    if (!target) return null;
    if (isCustomTarget(target)) return allowedCustomKeys.has(customKeyOf(target)) ? target : null;
    return target in IMPORT_FIELD_MAP ? (target as ImportFieldKey) : null;
  });

  return rows.map((cells, index) => {
    const fields: Partial<Record<ImportFieldKey, string>> = {};
    const custom: Record<string, string> = {};
    targets.forEach((target, column) => {
      const value = (cells[column] ?? "").trim();
      if (!target || !value) return;
      if (typeof target === "string" && isCustomTarget(target)) custom[customKeyOf(target)] = value;
      else fields[target as ImportFieldKey] = value;
    });
    return { row: index + 1, fields, custom };
  });
}

/**
 * Every row lands in exactly one bucket, checked in the order that makes the
 * user's choice meaningful: unusable rows first, then repeats inside the sheet,
 * then leads the org already holds, then the do-not-call list.
 */
async function classify(orgId: string, mapped: MappedRow[]): Promise<ClassifiedRow[]> {
  const withPhones = mapped.map((row) => {
    const rawName = row.fields.fullName ?? "";
    const rawPhone = row.fields.phonePrimary ?? "";
    const phone = normalisePhone(rawPhone);
    return { ...row, phoneRaw: rawPhone, phoneE164: phone.e164, valid: phone.valid, name: rawName };
  });

  const candidates = [...new Set(withPhones.map((r) => r.phoneE164).filter((p): p is string => Boolean(p)))];

  const existingRows = candidates.length
    ? await chunked(candidates, 500, (chunk) =>
        db
          .select({
            id: leads.id,
            phone: leads.phonePrimary,
            status: leads.status,
            assigneeName: users.name,
          })
          .from(leads)
          .leftJoin(users, eq(users.id, leads.assignedTo))
          .where(and(eq(leads.orgId, orgId), inArray(leads.phonePrimary, chunk))),
      )
    : [];

  const dncRows = candidates.length
    ? await chunked(candidates, 500, (chunk) =>
        db
          .select({ phone: doNotCall.phone })
          .from(doNotCall)
          .where(and(eq(doNotCall.orgId, orgId), inArray(doNotCall.phone, chunk))),
      )
    : [];

  const existingByPhone = new Map(existingRows.map((r) => [r.phone, r]));
  const dncPhones = new Set(dncRows.map((r) => r.phone));
  const seenInFile = new Set<string>();

  return withPhones.map((row): ClassifiedRow => {
    const base = { row: row.row, fields: row.fields, custom: row.custom, phoneE164: row.phoneE164, phoneRaw: row.phoneRaw };

    if (!row.name.trim()) return { ...base, verdict: "invalid", reason: "No name in the mapped column" };
    if (!row.phoneRaw.trim()) return { ...base, verdict: "invalid", reason: "No phone number" };
    if (!row.phoneE164) {
      return { ...base, verdict: "invalid", reason: `“${row.phoneRaw}” is not a phone number we can dial` };
    }

    if (seenInFile.has(row.phoneE164)) {
      return { ...base, verdict: "duplicate_in_file", reason: "Same number as an earlier row" };
    }
    seenInFile.add(row.phoneE164);

    const existing = existingByPhone.get(row.phoneE164);
    if (existing) {
      return {
        ...base,
        verdict: "duplicate",
        existing: { id: existing.id, status: existing.status, assigneeName: existing.assigneeName },
      };
    }

    if (dncPhones.has(row.phoneE164)) return { ...base, verdict: "dnc", reason: "On the org do-not-call list" };

    return { ...base, verdict: "ready" };
  });
}

async function chunked<T, R>(items: T[], size: number, run: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await run(items.slice(i, i + size))));
  return out;
}

async function activeCustomKeys(orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ key: customFieldDefs.key })
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.orgId, orgId), eq(customFieldDefs.isActive, true)));
  return new Set(rows.map((r) => r.key));
}

function fail(error: unknown): ActionResult<never> {
  if (error instanceof PermissionError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "That sheet could not be read." };
  }
  console.error("[import]", error);
  return { ok: false, error: "The import failed. Nothing was written." };
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

export async function previewImport(input: unknown): Promise<ActionResult<ImportPreview>> {
  try {
    const ctx = await requireSession();
    await assertCanManageTeam(ctx.user.id, ctx.team.id);
    const data = importPreviewSchema.parse(input);

    const mapped = mapRows(data.headers, data.rows, data.mapping, await activeCustomKeys(ctx.org.id));
    const classified = await classify(ctx.org.id, mapped);

    const counts: Record<RowVerdict, number> = {
      ready: 0,
      duplicate: 0,
      duplicate_in_file: 0,
      dnc: 0,
      invalid: 0,
    };
    const perGroup = new Map<RowVerdict, PreviewRow[]>();
    let truncated = false;

    for (const row of classified) {
      counts[row.verdict]++;
      const bucket = perGroup.get(row.verdict) ?? [];
      if (bucket.length < MAX_PREVIEW_ROWS) {
        bucket.push({
          row: row.row,
          verdict: row.verdict,
          fullName: row.fields.fullName ?? "—",
          company: row.fields.company ?? null,
          phoneRaw: row.phoneRaw,
          phoneE164: row.phoneE164,
          reason: row.reason,
          existingAssignee: row.existing?.assigneeName ?? null,
          existingStatus: row.existing?.status,
        });
        perGroup.set(row.verdict, bucket);
      } else {
        truncated = true;
      }
    }

    return {
      ok: true,
      data: {
        totalRows: classified.length,
        counts,
        rows: [...perGroup.values()].flat().sort((a, b) => a.row - b.row),
        truncated,
      },
    };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ */
/* Commit                                                              */
/* ------------------------------------------------------------------ */

export type ImportSummary = {
  batchId: string;
  imported: number;
  updated: number;
  skipped: number;
  invalid: number;
  assigned: Array<{ name: string; count: number }>;
};

export async function runImport(input: unknown): Promise<ActionResult<ImportSummary>> {
  try {
    const ctx = await requireSession();
    await assertCanManageTeam(ctx.user.id, ctx.team.id);
    const data = runImportSchema.parse(input);

    const members = await teamMemberDirectory(ctx.team.id);
    const memberIds = new Set(members.map((m) => m.id));
    // Never trust the posted assignee list — narrow it to real team members.
    const assignPool = data.assignUserIds.filter((id) => memberIds.has(id));
    if (data.strategy === "round_robin" && assignPool.length === 0) {
      return { ok: false, error: "Pick at least one person to deal the leads out to." };
    }
    const fallbackAssignee = assignPool[0] ?? ctx.user.id;

    const mapped = mapRows(data.headers, data.rows, data.mapping, await activeCustomKeys(ctx.org.id));
    const classified = await classify(ctx.org.id, mapped);

    const toInsert = classified.filter(
      (r) => r.verdict === "ready" || (r.verdict === "dnc" && data.dncAction === "import_flagged"),
    );
    const toUpdate = data.duplicateAction === "update" ? classified.filter((r) => r.verdict === "duplicate") : [];
    const invalid = classified.filter((r) => r.verdict === "invalid");
    const skipped = classified.length - toInsert.length - toUpdate.length;

    const [batch] = await db
      .insert(importBatches)
      .values({
        teamId: ctx.team.id,
        uploadedBy: ctx.user.id,
        filename: data.filename.slice(0, 200),
        rowCount: classified.length,
        columnMapping: readableMapping(data.headers, data.mapping),
        assignmentStrategy: data.strategy,
        status: "processing",
        errorLog: invalid.slice(0, 200).map((r) => ({ row: r.row, message: r.reason ?? "Unusable row" })),
      })
      .returning({ id: importBatches.id });

    if (!batch) return { ok: false, error: "Could not start the import." };

    try {
      const assignedCounts = new Map<string, number>();
      const values: NewLead[] = toInsert.map((row, index) => {
        const assignedTo = pickAssignee({
          strategy: data.strategy,
          index,
          pool: assignPool,
          fallback: fallbackAssignee,
          columnValue: row.fields.assignee,
          members,
        });
        assignedCounts.set(assignedTo, (assignedCounts.get(assignedTo) ?? 0) + 1);

        return {
          orgId: ctx.org.id,
          teamId: ctx.team.id,
          fullName: (row.fields.fullName ?? "").slice(0, 160),
          company: row.fields.company?.slice(0, 160) ?? null,
          jobTitle: row.fields.jobTitle?.slice(0, 160) ?? null,
          phonePrimary: row.phoneE164!,
          phoneAlt: normalisePhone(row.fields.phoneAlt).e164 ?? row.fields.phoneAlt?.slice(0, 40) ?? null,
          email: row.fields.email?.slice(0, 200) ?? null,
          website: row.fields.website?.slice(0, 300) ?? null,
          city: row.fields.city?.slice(0, 120) ?? null,
          country: row.fields.country?.slice(0, 120) ?? null,
          timezone: row.fields.timezone?.slice(0, 64) ?? null,
          source: data.source,
          sourceBatchId: batch.id,
          sourceNote: data.sourceNote?.slice(0, 300) ?? null,
          status: row.verdict === "dnc" ? ("do_not_call" as const) : ("new" as const),
          tags: [...new Set([...data.tags, ...parseTags(row.fields.tags)])].slice(0, 20),
          customFields: row.custom,
          assignedTo,
          createdBy: ctx.user.id,
        };
      });

      /* Insert in chunks. `onConflictDoNothing` guards the org-wide phone
         uniqueness against a second import racing this one. */
      const insertedByPhone = new Map<string, string>();
      for (let i = 0; i < values.length; i += 250) {
        const rows = await db
          .insert(leads)
          .values(values.slice(i, i + 250))
          .onConflictDoNothing({ target: [leads.orgId, leads.phonePrimary] })
          .returning({ id: leads.id, phone: leads.phonePrimary });
        for (const row of rows) insertedByPhone.set(row.phone, row.id);
      }

      await recordActivities(
        [...insertedByPhone.values()].map((leadId) => ({
          leadId,
          userId: ctx.user.id,
          type: "import" as const,
          body: `Imported from ${data.filename}`,
          toValue: { batchId: batch.id, source: data.source },
        })),
      );

      /* "Update existing" fills the gaps on a lead the org already holds —
         it never overwrites a value the sheet left blank, and never touches
         pipeline state a caller has already set. */
      let updated = 0;
      for (const row of toUpdate) {
        if (!row.existing) continue;
        const patch = enrichmentPatch(row);
        if (Object.keys(patch).length === 0) continue;
        await db
          .update(leads)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(leads.id, row.existing.id));
        updated++;
      }
      if (toUpdate.length > 0) {
        await recordActivities(
          toUpdate
            .filter((r) => r.existing)
            .map((r) => ({
              leadId: r.existing!.id,
              userId: ctx.user.id,
              type: "import" as const,
              body: `Details refreshed from ${data.filename}`,
              toValue: { batchId: batch.id },
            })),
        );
      }

      const imported = insertedByPhone.size;
      await db
        .update(importBatches)
        .set({
          importedCount: imported,
          duplicateCount: classified.filter((r) => r.verdict === "duplicate" || r.verdict === "duplicate_in_file").length,
          errorCount: invalid.length,
          status: "done",
        })
        .where(eq(importBatches.id, batch.id));

      const nameById = new Map(members.map((m) => [m.id, m.name ?? m.email]));
      for (const [userId, count] of assignedCounts) {
        if (userId === ctx.user.id || count === 0) continue;
        await notify({
          userId,
          type: "import",
          title: `${count} new ${count === 1 ? "lead" : "leads"} assigned to you`,
          body: `From ${data.filename}`,
          link: `/leads?batch=${batch.id}`,
        });
      }

      revalidatePath("/import");
      revalidatePath("/leads");
      revalidatePath("/today");

      return {
        ok: true,
        data: {
          batchId: batch.id,
          imported,
          updated,
          skipped,
          invalid: invalid.length,
          assigned: [...assignedCounts.entries()]
            .map(([id, count]) => ({ name: nameById.get(id) ?? "Unassigned", count }))
            .sort((a, b) => b.count - a.count),
        },
      };
    } catch (error) {
      await db.update(importBatches).set({ status: "failed" }).where(eq(importBatches.id, batch.id));
      throw error;
    }
  } catch (error) {
    return fail(error);
  }
}

/** Only fills blanks — an import must never quietly undo a caller's work. */
function enrichmentPatch(row: ClassifiedRow): Record<string, string> {
  const patch: Record<string, string> = {};
  const carry: Array<[ImportFieldKey, string]> = [
    ["company", "company"],
    ["jobTitle", "jobTitle"],
    ["email", "email"],
    ["website", "website"],
    ["city", "city"],
    ["country", "country"],
  ];
  for (const [field, column] of carry) {
    const value = row.fields[field];
    if (value) patch[column] = value.slice(0, 300);
  }
  return patch;
}

type Member = { id: string; name: string | null; email: string };

async function teamMemberDirectory(teamId: string): Promise<Member[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.teamId, teamId), eq(users.isActive, true)));
}

function pickAssignee(args: {
  strategy: "single" | "round_robin" | "by_column";
  index: number;
  pool: string[];
  fallback: string;
  columnValue?: string;
  members: Member[];
}): string {
  if (args.strategy === "round_robin" && args.pool.length > 0) {
    return args.pool[args.index % args.pool.length]!;
  }
  if (args.strategy === "by_column" && args.columnValue) {
    const needle = args.columnValue.trim().toLowerCase();
    const match = args.members.find(
      (m) => m.email.toLowerCase() === needle || (m.name ?? "").toLowerCase() === needle,
    );
    if (match) return match.id;
  }
  return args.fallback;
}

function readableMapping(headers: string[], mapping: Array<string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((header, i) => {
    const target = mapping[i];
    if (target) out[header] = target;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Undo                                                                */
/* ------------------------------------------------------------------ */

/**
 * A bad sheet is reversible right up until someone works the leads. Once any
 * activity other than the import row exists, the batch has history worth
 * keeping and the undo is refused rather than silently partial.
 */
export async function undoImportBatch(batchId: string): Promise<ActionResult<{ removed: number }>> {
  try {
    const ctx = await requireSession();
    const id = z.string().uuid().parse(batchId);

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
    if (!batch) return { ok: false, error: "That import no longer exists." };
    await assertCanManageTeam(ctx.user.id, batch.teamId);

    const batchLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.sourceBatchId, id));

    if (batchLeads.length === 0) {
      await db.delete(importBatches).where(eq(importBatches.id, id));
      revalidatePath("/import");
      return { ok: true, data: { removed: 0 } };
    }

    const leadIds = batchLeads.map((l) => l.id);
    const worked = await chunked(leadIds, 500, (chunk) =>
      db
        .select({ leadId: activities.leadId })
        .from(activities)
        .where(and(inArray(activities.leadId, chunk), ne(activities.type, "import")))
        .limit(1),
    );

    if (worked.length > 0) {
      return {
        ok: false,
        error: "Someone has already worked these leads — calls and notes would be lost, so this batch can't be undone.",
      };
    }

    for (let i = 0; i < leadIds.length; i += 500) {
      await db.delete(leads).where(inArray(leads.id, leadIds.slice(i, i + 500)));
    }
    await db.delete(importBatches).where(eq(importBatches.id, id));

    revalidatePath("/import");
    revalidatePath("/leads");
    return { ok: true, data: { removed: leadIds.length } };
  } catch (error) {
    return fail(error);
  }
}

/** Used by the wizard to warn before a second import of the same file. */
export async function recentBatchFilenames(): Promise<string[]> {
  const ctx: SessionContext = await requireSession();
  const rows = await db
    .select({ filename: importBatches.filename })
    .from(importBatches)
    .where(eq(importBatches.teamId, ctx.team.id))
    .orderBy(sql`${importBatches.createdAt} desc`)
    .limit(20);
  return rows.map((r) => r.filename);
}
