import "server-only";
import { addDays } from "date-fns";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, notifications } from "@/lib/db/schema";
import { recordActivities, notify } from "@/lib/actions/activity";
import { TRIAL_LENGTH_DAYS } from "@/lib/domain/constants";
import { TRIAL_TASKS } from "@/lib/domain/trials";

/**
 * Hourly. Walks every demo week forward:
 *   scheduled → active   once the booked demo time has passed
 *   active    → ended_pending  once the seventh day is up
 * and keeps `next_follow_up_at` sitting on the next 1/4/6/7 touch so the
 * cadence happens without anyone remembering it.
 */
export async function runTrialTransitions(now = new Date()) {
  const started = await startDueTrials(now);
  const ended = await endFinishedTrials(now);
  const advanced = await advanceTrialTasks(now);
  const notified = await notifyEndingSoon(now);

  return { started, ended, advanced, notified };
}

async function startDueTrials(now: Date): Promise<number> {
  const due = await db
    .select({ id: leads.id, assignedTo: leads.assignedTo, fullName: leads.fullName, at: leads.demoScheduledAt })
    .from(leads)
    .where(
      and(
        eq(leads.trialStatus, "scheduled"),
        isNotNull(leads.demoScheduledAt),
        lte(leads.demoScheduledAt, now),
        eq(leads.isArchived, false),
      ),
    )
    .limit(500);

  for (const lead of due) {
    const startedAt = lead.at ?? now;
    await db
      .update(leads)
      .set({
        trialStatus: "active",
        status: "trial_active",
        trialStartedAt: startedAt,
        trialEndsAt: addDays(startedAt, TRIAL_LENGTH_DAYS),
        nextFollowUpAt: addDays(startedAt, TRIAL_TASKS[0]!.day),
        followUpChannel: "call",
        followUpNote: TRIAL_TASKS[0]!.note,
        updatedAt: now,
      })
      .where(eq(leads.id, lead.id));
  }

  await recordActivities(
    due.map((lead) => ({
      leadId: lead.id,
      userId: null,
      type: "trial_event" as const,
      body: "Demo week started automatically — the scheduled demo time passed",
      toValue: { trialStatus: "active" },
    })),
  );

  return due.length;
}

async function endFinishedTrials(now: Date): Promise<number> {
  const over = await db
    .select({ id: leads.id, assignedTo: leads.assignedTo, fullName: leads.fullName, company: leads.company })
    .from(leads)
    .where(and(eq(leads.trialStatus, "active"), isNotNull(leads.trialEndsAt), lte(leads.trialEndsAt, now)))
    .limit(500);

  for (const lead of over) {
    await db
      .update(leads)
      .set({
        trialStatus: "ended_pending",
        nextFollowUpAt: now,
        followUpChannel: "call",
        followUpNote: TRIAL_TASKS[TRIAL_TASKS.length - 1]!.note,
        updatedAt: now,
      })
      .where(eq(leads.id, lead.id));

    if (lead.assignedTo) {
      await notify({
        userId: lead.assignedTo,
        type: "trial_ended",
        title: `${lead.fullName}'s demo week is over`,
        body: "Make the conversion call today — pending trials go cold fast.",
        link: `/leads?lead=${lead.id}`,
      });
    }
  }

  await recordActivities(
    over.map((lead) => ({
      leadId: lead.id,
      userId: null,
      type: "trial_event" as const,
      body: "Demo week finished — awaiting a decision",
      toValue: { trialStatus: "ended_pending" },
    })),
  );

  return over.length;
}

/**
 * Moves the follow-up onto the next cadence touch once the current one is due.
 * Only ever moves it forward, so a caller who set their own later date keeps it.
 */
async function advanceTrialTasks(now: Date): Promise<number> {
  const active = await db
    .select({
      id: leads.id,
      trialStartedAt: leads.trialStartedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
    })
    .from(leads)
    .where(and(eq(leads.trialStatus, "active"), isNotNull(leads.trialStartedAt)))
    .limit(500);

  let moved = 0;
  for (const lead of active) {
    if (!lead.trialStartedAt) continue;
    if (lead.nextFollowUpAt && lead.nextFollowUpAt > now) continue;

    const elapsed = Math.floor((now.getTime() - lead.trialStartedAt.getTime()) / 86_400_000);
    const next = TRIAL_TASKS.find((task) => task.day > elapsed);
    if (!next) continue;

    await db
      .update(leads)
      .set({
        nextFollowUpAt: addDays(lead.trialStartedAt, next.day),
        followUpChannel: "call",
        followUpNote: next.note,
        updatedAt: now,
      })
      .where(eq(leads.id, lead.id));
    moved++;
  }
  return moved;
}

/** One heads-up per lead per day, so an hourly job does not become a pager. */
async function notifyEndingSoon(now: Date): Promise<number> {
  const soon = await db
    .select({ id: leads.id, fullName: leads.fullName, assignedTo: leads.assignedTo, endsAt: leads.trialEndsAt })
    .from(leads)
    .where(
      and(
        eq(leads.trialStatus, "active"),
        isNotNull(leads.trialEndsAt),
        gte(leads.trialEndsAt, now),
        lte(leads.trialEndsAt, addDays(now, 2)),
        isNotNull(leads.assignedTo),
      ),
    )
    .limit(200);

  let sent = 0;
  for (const lead of soon) {
    if (!lead.assignedTo) continue;
    const [already] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, lead.assignedTo),
          eq(notifications.type, "trial_ending"),
          eq(notifications.link, `/leads?lead=${lead.id}`),
          gte(notifications.createdAt, startOfDayUtc(now)),
        ),
      )
      .limit(1);
    if (already) continue;

    await notify({
      userId: lead.assignedTo,
      type: "trial_ending",
      title: `${lead.fullName}'s demo week ends soon`,
      body: "Day 6 is the pre-close. Call before the week runs out.",
      link: `/leads?lead=${lead.id}`,
    });
    sent++;
  }
  return sent;
}

function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Every half hour. Tells a caller their follow-up is due, once a day per lead —
 * a reminder that repeats every thirty minutes is a reminder people mute.
 */
export async function runOverdueNotifications(now = new Date()) {
  const overdue = await db
    .select({ id: leads.id, fullName: leads.fullName, assignedTo: leads.assignedTo })
    .from(leads)
    .where(
      and(
        isNotNull(leads.nextFollowUpAt),
        lte(leads.nextFollowUpAt, now),
        isNotNull(leads.assignedTo),
        eq(leads.isArchived, false),
        sql`${leads.status} not in ('converted','lost','not_interested','wrong_number','do_not_call')`,
      ),
    )
    .limit(400);

  const since = startOfDayUtc(now);
  let sent = 0;

  for (const lead of overdue) {
    if (!lead.assignedTo) continue;
    const [already] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, lead.assignedTo),
          eq(notifications.type, "follow_up_due"),
          eq(notifications.link, `/leads?lead=${lead.id}`),
          gte(notifications.createdAt, since),
        ),
      )
      .limit(1);
    if (already) continue;

    await notify({
      userId: lead.assignedTo,
      type: "follow_up_due",
      title: `Follow-up due: ${lead.fullName}`,
      body: "This one is past its date.",
      link: `/leads?lead=${lead.id}`,
    });
    sent++;
  }

  return { overdue: overdue.length, notified: sent };
}
