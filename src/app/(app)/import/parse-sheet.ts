import { MAX_IMPORT_ROWS, parseDelimited } from "@/lib/domain/import";

export type Sheet = {
  filename: string;
  headers: string[];
  rows: string[][];
  /** Rows dropped because the sheet was longer than one import can take. */
  overflow: number;
};

/** Trim, pad to the header width, and cap cells — the server caps them too. */
function normalise(table: string[][], filename: string): Sheet {
  const [headerRow, ...body] = table;
  if (!headerRow || headerRow.length === 0) {
    return { filename, headers: [], rows: [], overflow: 0 };
  }

  const headers = headerRow.map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
  const all = body
    .map((row) => Array.from({ length: headers.length }, (_, i) => String(row[i] ?? "").trim().slice(0, 500)))
    .filter((row) => row.some((cell) => cell !== ""));

  return {
    filename,
    headers,
    rows: all.slice(0, MAX_IMPORT_ROWS),
    overflow: Math.max(0, all.length - MAX_IMPORT_ROWS),
  };
}

/**
 * CSV and XLSX parsers are both loaded on demand — a caller who never opens
 * the importer never downloads them.
 */
export async function parseSheetFile(file: File): Promise<Sheet> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "xlsx" || extension === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const first = workbook.SheetNames[0];
    if (!first) throw new Error("That workbook has no sheets in it.");
    const table = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[first]!, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    });
    return normalise(table, file.name);
  }

  const Papa = (await import("papaparse")).default;
  const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
  return normalise(parsed.data, file.name);
}

export function parsePastedSheet(text: string): Sheet {
  const { headers, rows } = parseDelimited(text);
  return {
    filename: "Pasted from a sheet",
    headers,
    rows: rows.slice(0, MAX_IMPORT_ROWS),
    overflow: Math.max(0, rows.length - MAX_IMPORT_ROWS),
  };
}

export const ACCEPTED_EXTENSIONS = ".csv,.tsv,.txt,.xlsx,.xls";
