import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customFieldDefs } from "@/lib/db/schema";

export type ResolvedCustomField = { key: string; label: string; value: string };

/**
 * Turns a lead's `custom_fields` blob into labelled, ordered, display-ready
 * rows.
 *
 * The blob only ever holds `{ key: value }`, so on its own it cannot be
 * rendered sensibly — "linkedin_url" is not a label. Anything the org has
 * since archived, or a key with no definition at all (which an older import
 * can leave behind), is dropped rather than shown raw.
 */
export async function resolveCustomFields(
  orgId: string,
  values: Record<string, unknown> | null,
): Promise<ResolvedCustomField[]> {
  if (!values || Object.keys(values).length === 0) return [];

  const defs = await db
    .select({ key: customFieldDefs.key, label: customFieldDefs.label })
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.orgId, orgId), eq(customFieldDefs.isActive, true)))
    .orderBy(asc(customFieldDefs.sortOrder), asc(customFieldDefs.label));

  return defs
    .map(({ key, label }) => ({ key, label, value: display(values[key]) }))
    .filter((field) => field.value !== "");
}

/** Whatever the importer put in the blob, rendered as one line of text. */
function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(display).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).trim();
}
