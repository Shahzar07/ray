import "server-only";
import { db } from "@/lib/db/client";
import { activities, notifications, type ActivityType, type CallOutcome } from "@/lib/db/schema";

/**
 * The only way anything is written to `activities`. Append-only: this module
 * exposes no update and no delete, and nothing else in the app imports the
 * table directly for writes.
 */
export async function recordActivity(entry: {
  leadId: string;
  userId: string | null;
  type: ActivityType;
  callOutcome?: CallOutcome | null;
  durationSeconds?: number | null;
  body?: string | null;
  fromValue?: unknown;
  toValue?: unknown;
  aiGenerated?: boolean;
}): Promise<void> {
  await db.insert(activities).values({
    leadId: entry.leadId,
    userId: entry.userId,
    type: entry.type,
    callOutcome: entry.callOutcome ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    // Keep bodies bounded — Postgres is not a blob store and the free tier is 0.5 GB.
    body: entry.body ? entry.body.slice(0, 4000) : null,
    fromValue: entry.fromValue ?? null,
    toValue: entry.toValue ?? null,
    aiGenerated: entry.aiGenerated ?? false,
  });
}

export async function notify(entry: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  await db.insert(notifications).values({
    userId: entry.userId,
    type: entry.type,
    title: entry.title,
    body: entry.body ?? null,
    link: entry.link ?? null,
  });
}

/** Diff two records and return only the fields that actually changed. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { from: Record<string, unknown>; to: Record<string, unknown>; keys: string[] } {
  const from: Record<string, unknown> = {};
  const to: Record<string, unknown> = {};
  const keys: string[] = [];

  for (const [key, next] of Object.entries(after)) {
    const prev = before[key];
    const same =
      prev instanceof Date && next instanceof Date
        ? prev.getTime() === next.getTime()
        : JSON.stringify(prev ?? null) === JSON.stringify(next ?? null);
    if (!same) {
      from[key] = prev;
      to[key] = next;
      keys.push(key);
    }
  }
  return { from, to, keys };
}
