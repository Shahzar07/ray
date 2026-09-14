import { formatInTimeZone } from "date-fns-tz";
export function localWorkDate(now: Date, timezone: string) {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}
export function elapsedSeconds(
  start: Date | string,
  end: Date | string = new Date(),
) {
  return Math.max(
    0,
    Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000),
  );
}
export function formatDuration(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a valid month.");
  const [year, n] = month.split("-").map(Number) as [number, number];
  if (year < 2000 || year > 2100)
    throw new Error("Choose a year between 2000 and 2100.");
  const days = new Date(Date.UTC(year, n, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${days}`, days };
}
