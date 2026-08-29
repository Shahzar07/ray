/**
 * Date-range vocabulary for the dashboards. Plain module on purpose: the server
 * pages parse the range out of the URL and the client filter renders it, so it
 * can be neither `server-only` nor `"use client"`.
 */

export const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  /* 0 means "as far back as there is data" — the leaderboard's all-time view. */
  { days: 0, label: "All time" },
] as const;

export type RangeDays = (typeof RANGES)[number]["days"];

export function parseRange(value: string | string[] | undefined): RangeDays {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === "") return 30;
  const n = Number(raw);
  return (RANGES.find((r) => r.days === n)?.days ?? 30) as RangeDays;
}

/** Days to actually query for. All-time is a decade, which is past this app's life. */
export function rangeDays(days: number): number {
  return days === 0 ? 3650 : days;
}

export function rangeLabel(days: number): string {
  return RANGES.find((r) => r.days === days)?.label ?? "30 days";
}
