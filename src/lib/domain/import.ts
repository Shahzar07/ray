import { APP_SHORT_NAME } from "./constants";
/**
 * Importer vocabulary shared by the client wizard and the server actions.
 *
 * Deliberately free of `server-only` imports: the mapping step runs in the
 * browser and needs `IMPORT_FIELDS` and `autoDetectMapping`, while the server
 * re-derives every value from the same table so a tampered mapping cannot
 * write a column the user was never offered.
 */

export const MAX_IMPORT_ROWS = 5000;
export const MAX_PREVIEW_ROWS = 60;

export type ImportFieldKey =
  | "fullName"
  | "phonePrimary"
  | "phoneAlt"
  | "company"
  | "jobTitle"
  | "email"
  | "website"
  | "city"
  | "country"
  | "timezone"
  | "tags"
  | "assignee";

type FieldMeta = {
  key: ImportFieldKey;
  label: string;
  hint?: string;
  required?: boolean;
  /** Lower-cased header fragments that map onto this field. */
  synonyms: string[];
};

export const IMPORT_FIELDS: FieldMeta[] = [
  {
    key: "fullName",
    label: "Full name",
    required: true,
    synonyms: ["full name", "name", "contact", "contact name", "person", "owner name", "lead name", "client"],
  },
  {
    key: "phonePrimary",
    label: "Phone",
    required: true,
    hint: "Normalised to +92… on import",
    synonyms: ["phone", "phone number", "mobile", "cell", "contact number", "number", "tel", "telephone", "whatsapp"],
  },
  { key: "phoneAlt", label: "Alt phone", synonyms: ["alt phone", "phone 2", "secondary phone", "landline", "office phone", "other number"] },
  { key: "company", label: "Company", synonyms: ["company", "business", "business name", "organisation", "organization", "clinic", "shop", "firm", "brand"] },
  { key: "jobTitle", label: "Job title", synonyms: ["title", "job title", "role", "position", "designation"] },
  { key: "email", label: "Email", synonyms: ["email", "e-mail", "email address", "mail"] },
  { key: "website", label: "Website", synonyms: ["website", "site", "url", "web", "domain"] },
  { key: "city", label: "City", synonyms: ["city", "town", "location", "area"] },
  { key: "country", label: "Country", synonyms: ["country", "nation"] },
  { key: "timezone", label: "Timezone", hint: "Drives the calling window", synonyms: ["timezone", "time zone", "tz"] },
  { key: "tags", label: "Tags", hint: "Comma-separated", synonyms: ["tags", "tag", "labels", "category", "categories", "niche", "industry"] },
  {
    key: "assignee",
    label: "Assign to",
    hint: "Email or name — used by “from a column”",
    synonyms: ["assigned to", "assignee", "owner", "caller", "agent", "rep", "salesperson"],
  },
];

export const IMPORT_FIELD_MAP: Record<ImportFieldKey, FieldMeta> = Object.fromEntries(
  IMPORT_FIELDS.map((f) => [f.key, f]),
) as Record<ImportFieldKey, FieldMeta>;

/** A mapping target is a lead field, a `custom:<key>` field, or nothing. */
export type MappingTarget = string | null;

export function isCustomTarget(target: MappingTarget): target is `custom:${string}` {
  return typeof target === "string" && target.startsWith("custom:");
}

export function customKeyOf(target: string): string {
  return target.slice("custom:".length);
}

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Guesses a mapping from the sheet's header row. Exact synonym matches win
 * over partial ones so a "Company Email" column does not steal "Company".
 */
export function autoDetectMapping(headers: string[], customFieldKeys: string[] = []): MappingTarget[] {
  const taken = new Set<string>();
  const normalised = headers.map(normaliseHeader);
  const mapping: MappingTarget[] = headers.map(() => null);

  const claim = (index: number, target: string) => {
    if (mapping[index] !== null || taken.has(target)) return;
    mapping[index] = target;
    taken.add(target);
  };

  for (const exact of [true, false]) {
    for (const field of IMPORT_FIELDS) {
      if (taken.has(field.key)) continue;
      const index = normalised.findIndex((header, i) => {
        if (mapping[i] !== null || !header) return false;
        return exact
          ? field.synonyms.includes(header)
          : field.synonyms.some((s) => header.includes(s) || s.includes(header));
      });
      if (index >= 0) claim(index, field.key);
    }
  }

  for (const key of customFieldKeys) {
    const target = `custom:${key}`;
    if (taken.has(target)) continue;
    const wanted = normaliseHeader(key);
    const index = normalised.findIndex((header, i) => mapping[i] === null && header === wanted);
    if (index >= 0) claim(index, target);
  }

  return mapping;
}

/** Every row lands in exactly one of these buckets. */
export type RowVerdict = "ready" | "duplicate" | "duplicate_in_file" | "dnc" | "invalid";

export const VERDICT_META: Record<RowVerdict, { label: string; tone: "success" | "warning" | "danger" | "neutral"; blurb: string }> = {
  ready: { label: "New leads", tone: "success", blurb: `Not in ${APP_SHORT_NAME} yet — these get created.` },
  duplicate: { label: `Already in ${APP_SHORT_NAME}`, tone: "warning", blurb: "The phone number matches a lead your org already has." },
  duplicate_in_file: { label: "Repeated in this sheet", tone: "neutral", blurb: "The same number appears more than once. The first row wins." },
  dnc: { label: "On the do-not-call list", tone: "danger", blurb: "Someone in your org marked this number as do-not-call." },
  invalid: { label: "Can't be imported", tone: "danger", blurb: "No readable name or phone number, so there is nothing to dial." },
};

/** What the user chose to do with each reviewable group. */
export type DuplicateAction = "skip" | "update";
export type DncAction = "skip" | "import_flagged";

export type PreviewRow = {
  /** 1-based row number in the user's sheet, header excluded. */
  row: number;
  verdict: RowVerdict;
  fullName: string;
  company: string | null;
  phoneRaw: string;
  phoneE164: string | null;
  reason?: string;
  /** Set on `duplicate` — who currently holds the matching lead. */
  existingAssignee?: string | null;
  existingStatus?: string;
};

export type ImportPreview = {
  totalRows: number;
  counts: Record<RowVerdict, number>;
  rows: PreviewRow[];
  /** Truncated to MAX_PREVIEW_ROWS per group for the table. */
  truncated: boolean;
};

export type AssignmentStrategy = "single" | "round_robin" | "by_column";

export const ASSIGNMENT_STRATEGY: Record<AssignmentStrategy, { label: string; blurb: string }> = {
  single: { label: "One person", blurb: "Every lead in this sheet goes to the same caller." },
  round_robin: { label: "Round-robin", blurb: "Deal the leads out evenly across the people you pick." },
  by_column: { label: "From a column", blurb: "Read the assignee from the sheet, matched on email or name." },
};

/** Splits a "tags" cell — sheets use commas, semicolons or pipes interchangeably. */
export function parseTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[,;|]/)
        .map((t) => t.trim().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

/** Google Sheets pastes as TSV; a hand-pasted block may be CSV. Detect and split. */
export function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!clean) return { headers: [], rows: [] };

  const firstLine = clean.split("\n")[0] ?? "";
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";

  const lines = splitRecords(clean, delimiter);
  const [headerRow, ...rest] = lines;
  if (!headerRow) return { headers: [], rows: [] };

  const width = headerRow.length;
  return {
    headers: headerRow.map((h, i) => h.trim() || `Column ${i + 1}`),
    rows: rest
      .filter((row) => row.some((cell) => cell.trim() !== ""))
      .map((row) => Array.from({ length: width }, (_, i) => (row[i] ?? "").trim())),
  };
}

/** Minimal RFC-4180 reader — handles quoted cells containing the delimiter. */
function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") records.push(row);
  return records;
}
