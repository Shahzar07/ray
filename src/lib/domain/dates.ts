import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import {
  addDays,
  differenceInCalendarDays,
  differenceInMinutes,
  isToday as isTodayFn,
  startOfDay,
} from "date-fns";
import { TRIAL_LENGTH_DAYS } from "./constants";

export const DEFAULT_TZ = "Asia/Karachi";

/** Every timestamp is stored UTC and rendered in the viewer's zone, labelled. */
export function fmt(date: Date | string | null | undefined, pattern: string, tz = DEFAULT_TZ): string {
  if (!date) return "—";
  return formatInTimeZone(new Date(date), tz, pattern);
}

export function fmtDate(date: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  return fmt(date, "d MMM yyyy", tz);
}

export function fmtDateTime(date: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  return fmt(date, "d MMM, h:mm a", tz);
}

export function fmtTime(date: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  return fmt(date, "h:mm a", tz);
}

export function zoneLabel(tz = DEFAULT_TZ, at: Date = new Date()): string {
  return formatInTimeZone(at, tz, "zzz");
}

/** "in 3 days" / "2 hours ago" — short, calm, no library bloat. */
export function relative(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return "—";
  const target = new Date(date);
  const mins = differenceInMinutes(target, now);
  const abs = Math.abs(mins);
  const suffix = (v: string) => (mins < 0 ? `${v} ago` : `in ${v}`);

  if (abs < 1) return "just now";
  if (abs < 60) return suffix(`${abs}m`);
  if (abs < 60 * 24) return suffix(`${Math.round(abs / 60)}h`);
  const days = Math.round(abs / (60 * 24));
  if (days < 30) return suffix(`${days}d`);
  const months = Math.round(days / 30);
  if (months < 12) return suffix(`${months}mo`);
  return suffix(`${Math.round(months / 12)}y`);
}

export function isOverdue(date: Date | string | null | undefined, now = new Date()): boolean {
  if (!date) return false;
  return new Date(date).getTime() < now.getTime();
}

export function isDueToday(date: Date | string | null | undefined, tz = DEFAULT_TZ): boolean {
  if (!date) return false;
  return isTodayFn(toZonedTime(new Date(date), tz));
}

export function trialEndFor(start: Date): Date {
  return addDays(start, TRIAL_LENGTH_DAYS);
}

/** "Day 3 of 7" — 1-indexed, clamped to the trial window. */
export function trialDay(startedAt: Date | string | null | undefined, now = new Date()): number | null {
  if (!startedAt) return null;
  const day = differenceInCalendarDays(startOfDay(now), startOfDay(new Date(startedAt))) + 1;
  return Math.min(Math.max(day, 1), TRIAL_LENGTH_DAYS + 1);
}

export function daysUntil(date: Date | string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  return differenceInCalendarDays(startOfDay(new Date(date)), startOfDay(now));
}

/** The lead's own wall-clock hour — Call Mode never dials outside the window. */
export function leadLocalHour(tz: string | null | undefined, now = new Date()): number | null {
  if (!tz) return null;
  try {
    return Number(formatInTimeZone(now, tz, "H"));
  } catch {
    return null;
  }
}

export function isInCallingWindow(
  tz: string | null | undefined,
  startHour: number,
  endHour: number,
  now = new Date(),
): boolean {
  const hour = leadLocalHour(tz, now);
  if (hour === null) return true; // unknown zone — never hide the lead
  return hour >= startHour && hour < endHour;
}

export function todayInZone(tz = DEFAULT_TZ, now = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

export const COMMON_TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Riyadh",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];
