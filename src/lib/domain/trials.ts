import { addDays } from "date-fns";
import { TRIAL_LENGTH_DAYS } from "./constants";

/**
 * The demo week is the product's conversion engine, so its cadence is fixed
 * and explicit: four touches across seven days. `next_follow_up_at` on the
 * lead walks this list; the hourly cron advances it.
 */
export const TRIAL_TASKS: Array<{ day: number; note: string }> = [
  { day: 1, note: "Day 1 — setup check" },
  { day: 4, note: "Day 4 — mid-week value check" },
  { day: 6, note: "Day 6 — pre-close" },
  { day: 7, note: "Day 7 — conversion call" },
];

export function nextTrialTask(startedAt: Date, now = new Date()) {
  const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000);
  return TRIAL_TASKS.find((t) => t.day > elapsed) ?? null;
}

export function trialTaskDate(startedAt: Date, day: number): Date {
  return addDays(startedAt, day);
}

export { TRIAL_LENGTH_DAYS };
