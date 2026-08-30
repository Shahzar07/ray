"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { doNotCall, leads, memberships } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  assertCanEditLead,
  assertCanManageTeam,
  assertCanViewLead,
  PermissionError,
  visibleUserIds,
} from "@/lib/auth/visibility";
import { normalisePhone } from "@/lib/domain/phone";
import { TRIAL_LENGTH_DAYS } from "@/lib/domain/constants";
import { TRIAL_TASKS } from "@/lib/domain/trials";
import { changedFields, notify, recordActivity } from "./activity";
import { can } from "@/lib/domain/roles";
import {
  addNoteSchema,
  bulkActionSchema,
  createLeadSchema,
  bulkDncSchema,
  dncSchema,
  logCallSchema,
  trialActionSchema,
  updateLeadSchema,
} from "./schemas";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function fail(error: unknown): ActionResult<never> {
  if (error instanceof PermissionError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: error.issues[0]?.message ?? "Check the form and try again.",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  if (error instanceof Error && /leads_org_phone_uq/.test(error.message)) {
    return { ok: false, error: "A lead with that phone number already exists in this org." };
  }
  console.error("[action]", error);
  return { ok: false, error: "Something went wrong. Nothing was saved." };
}

function touchPaths() {
  revalidatePath("/leads");
  revalidatePath("/today");
  revalidatePath("/board");
  revalidatePath("/trials");
}

/* ------------------------------------------------------------------ */
/* Inline edits from the leads table and the detail drawer             */
/* ------------------------------------------------------------------ */

export async function updateLead(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await requireSession();
    const data = updateLeadSchema.parse(input);
    await assertCanEditLead(ctx.user.id, data.leadId);

    const [before] = await db.select().from(leads).where(eq(leads.id, data.leadId)).limit(1);
    if (!before) return { ok: false, error: "That lead no longer exists." };

    const { leadId, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (patch.email === "") patch.email = null;

    // A status of do_not_call also lands on the org-wide DNC list.
    if (patch.status === "do_not_call") {
      await addPhoneToDnc(ctx.org.id, before.phonePrimary, ctx.user.id, "Marked from lead");
    }
    if (patch.status === "converted" && !before.convertedAt) {
      patch.convertedAt = new Date();
      patch.trialStatus = "converted";
    }

    const diff = changedFields(before as unknown as Record<string, unknown>, patch);
    if (diff.keys.length === 0) return { ok: true };

    await db
      .update(leads)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    const isStatus = diff.keys.includes("status");
    const isAssign = diff.keys.includes("assignedTo");
    const isFollowUp = diff.keys.includes("nextFollowUpAt");

    await recordActivity({
      leadId,
      userId: ctx.user.id,
      type: isStatus ? "status_change" : isAssign ? "assignment" : isFollowUp ? "follow_up_set" : "field_change",
      fromValue: diff.from,
      toValue: diff.to,
    });

    if (isAssign && patch.assignedTo && patch.assignedTo !== ctx.user.id) {
      await notify({
        userId: patch.assignedTo as string,
        type: "assignment",
        title: `${before.fullName} was assigned to you`,
        body: before.company ?? undefined,
        link: `/leads?lead=${leadId}`,
      });
    }

    touchPaths();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ */
/* Call Mode — the highest-traffic write in the app                    */
/* ------------------------------------------------------------------ */

export async function logCall(input: unknown): Promise<ActionResult<{ leadId: string }>> {
  try {
    const ctx = await requireSession();
    const data = logCallSchema.parse(input);
    await assertCanEditLead(ctx.user.id, data.leadId);

    const [lead] = await db.select().from(leads).where(eq(leads.id, data.leadId)).limit(1);
    if (!lead) return { ok: false, error: "That lead no longer exists." };

    const now = new Date();
    const connected = data.outcome === "answered";

    const patch: Record<string, unknown> = {
      attemptsCount: lead.attemptsCount + 1,
      lastAttemptedAt: now,
      updatedAt: now,
    };
    if (connected) {
      patch.connectsCount = lead.connectsCount + 1;
      patch.lastConnectedAt = now;
    }

    // Derive a status when the caller did not pick one explicitly.
    if (data.status) {
      patch.status = data.status;
    } else if (data.outcome === "wrong_number") {
      patch.status = "wrong_number";
    } else if (connected && lead.status === "new") {
      patch.status = "connected";
    } else if (!connected && lead.status === "new") {
      patch.status = "attempted";
    }

    if (data.interestLevel !== undefined) patch.interestLevel = data.interestLevel;
    if (data.nextFollowUpAt !== undefined) {
      patch.nextFollowUpAt = data.nextFollowUpAt;
      patch.followUpChannel = data.followUpChannel ?? "call";
      if (data.nextFollowUpAt) patch.followUpCount = lead.followUpCount + 1;
    }
    if (data.demoScheduledAt) {
      patch.demoScheduledAt = data.demoScheduledAt;
      patch.trialStatus = "scheduled";
      patch.status = "demo_scheduled";
    }
    if (data.startTrial) {
      patch.trialStartedAt = now;
      patch.trialEndsAt = addDays(now, TRIAL_LENGTH_DAYS);
      patch.trialStatus = "active";
      patch.status = "trial_active";
      // Day-1 setup check is the first auto-scheduled trial task.
      patch.nextFollowUpAt = addDays(now, 1);
      patch.followUpChannel = "call";
      patch.followUpNote = "Day 1 — setup check";
    }
    if (patch.status === "converted") {
      patch.convertedAt = now;
      patch.trialStatus = "converted";
    }
    if (patch.status === "do_not_call") {
      await addPhoneToDnc(ctx.org.id, lead.phonePrimary, ctx.user.id, "Marked during call");
    }

    await db.update(leads).set(patch).where(eq(leads.id, data.leadId));

    await recordActivity({
      leadId: data.leadId,
      userId: ctx.user.id,
      type: "call",
      callOutcome: data.outcome,
      durationSeconds: data.durationSeconds ?? null,
      body: data.note?.trim() || null,
      fromValue: { status: lead.status, interestLevel: lead.interestLevel },
      toValue: { status: patch.status ?? lead.status, interestLevel: patch.interestLevel ?? lead.interestLevel },
    });

    if (data.startTrial) {
      await recordActivity({
        leadId: data.leadId,
        userId: ctx.user.id,
        type: "trial_event",
        body: `7-day demo week started — ends ${addDays(now, TRIAL_LENGTH_DAYS).toDateString()}`,
        toValue: { trialStatus: "active" },
      });
    } else if (data.demoScheduledAt) {
      await recordActivity({
        leadId: data.leadId,
        userId: ctx.user.id,
        type: "trial_event",
        body: "Demo scheduled",
        toValue: { trialStatus: "scheduled" },
      });
    }

    touchPaths();
    return { ok: true, data: { leadId: data.leadId } };
  } catch (error) {
    return fail(error);
  }
}

export async function addNote(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await requireSession();
    const data = addNoteSchema.parse(input);
    await assertCanEditLead(ctx.user.id, data.leadId);

    await recordActivity({
      leadId: data.leadId,
      userId: ctx.user.id,
      type: "note",
      body: data.body.trim(),
      aiGenerated: data.aiGenerated ?? false,
    });
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, data.leadId));

    revalidatePath("/leads");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ */
/* Trial lifecycle                                                     */
/* ------------------------------------------------------------------ */

export async function trialAction(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await requireSession();
    const data = trialActionSchema.parse(input);
    await assertCanEditLead(ctx.user.id, data.leadId);

    const [lead] = await db.select().from(leads).where(eq(leads.id, data.leadId)).limit(1);
    if (!lead) return { ok: false, error: "That lead no longer exists." };

    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };

    switch (data.action) {
      case "schedule":
        patch.demoScheduledAt = data.scheduledAt ?? addDays(now, 1);
        patch.trialStatus = "scheduled";
        patch.status = "demo_scheduled";
        patch.nextFollowUpAt = data.scheduledAt ?? addDays(now, 1);
        patch.followUpNote = "Demo call";
        break;
      case "start": {
        patch.trialStartedAt = now;
        patch.trialEndsAt = addDays(now, TRIAL_LENGTH_DAYS);
        patch.trialStatus = "active";
        patch.status = "trial_active";
        patch.nextFollowUpAt = addDays(now, 1);
        patch.followUpChannel = "call";
        patch.followUpNote = TRIAL_TASKS[0]!.note;
        break;
      }
      case "convert":
        patch.trialStatus = "converted";
        patch.status = "converted";
        patch.convertedAt = now;
        patch.nextFollowUpAt = null;
        patch.followUpNote = null;
        break;
      case "churn":
        patch.trialStatus = "churned";
        patch.status = "lost";
        patch.lostReason = "no_need";
        patch.nextFollowUpAt = null;
        break;
      case "cancel":
        patch.trialStatus = "none";
        patch.trialStartedAt = null;
        patch.trialEndsAt = null;
        patch.demoScheduledAt = null;
        patch.status = lead.connectsCount > 0 ? "connected" : "attempted";
        break;
    }

    await db.update(leads).set(patch).where(eq(leads.id, data.leadId));
    await recordActivity({
      leadId: data.leadId,
      userId: ctx.user.id,
      type: "trial_event",
      body: data.note?.trim() || trialLabel(data.action),
      fromValue: { trialStatus: lead.trialStatus },
      toValue: { trialStatus: patch.trialStatus },
    });

    touchPaths();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

function trialLabel(action: string) {
  return (
    {
      schedule: "Demo scheduled",
      start: "7-day demo week started",
      convert: "Converted to paying client",
      churn: "Trial ended without conversion",
      cancel: "Trial cancelled",
    }[action] ?? action
  );
}

/* ------------------------------------------------------------------ */
/* Bulk operations (team_lead / owner)                                 */
/* ------------------------------------------------------------------ */

export async function bulkUpdate(input: unknown): Promise<ActionResult<{ affected: number }>> {
  try {
    const ctx = await requireSession();
    const data = bulkActionSchema.parse(input);

    // Narrow the id list to leads this user may actually touch — never trust
    // the ids the client posted.
    const allowed = await visibleUserIds(ctx.user.id, ctx.team.id);
    const rows = await db
      .select({ id: leads.id, assignedTo: leads.assignedTo, phone: leads.phonePrimary, status: leads.status })
      .from(leads)
      .where(and(eq(leads.teamId, ctx.team.id), inArray(leads.id, data.leadIds)));

    const canManage = can(ctx.role, "leads.manageAll");
    const targets = rows.filter((r) =>
      canManage ? true : r.assignedTo === ctx.user.id || r.assignedTo === null,
    );
    if (targets.length === 0) return { ok: false, error: "None of those leads are yours to change." };
    if (!canManage && (data.action === "assign" || data.action === "dnc")) {
      throw new PermissionError("Only team leads and owners can do that.");
    }
    void allowed;

    const ids = targets.map((t) => t.id);
    const now = new Date();

    switch (data.action) {
      case "status": {
        if (!data.status) return { ok: false, error: "Pick a status first." };
        await db.update(leads).set({ status: data.status, updatedAt: now }).where(inArray(leads.id, ids));
        break;
      }
      case "assign":
        await db
          .update(leads)
          .set({ assignedTo: data.assignedTo ?? null, updatedAt: now })
          .where(inArray(leads.id, ids));
        break;
      case "tag": {
        if (!data.tag) return { ok: false, error: "Type a tag first." };
        await db
          .update(leads)
          .set({ tags: sql`array(select distinct unnest(${leads.tags} || ${[data.tag]}::text[]))`, updatedAt: now })
          .where(inArray(leads.id, ids));
        break;
      }
      case "untag": {
        if (!data.tag) return { ok: false, error: "Pick a tag first." };
        await db
          .update(leads)
          .set({ tags: sql`array_remove(${leads.tags}, ${data.tag})`, updatedAt: now })
          .where(inArray(leads.id, ids));
        break;
      }
      case "follow_up":
        await db
          .update(leads)
          .set({ nextFollowUpAt: data.nextFollowUpAt ?? null, updatedAt: now })
          .where(inArray(leads.id, ids));
        break;
      case "archive":
        await db.update(leads).set({ isArchived: true, updatedAt: now }).where(inArray(leads.id, ids));
        break;
      case "unarchive":
        await db.update(leads).set({ isArchived: false, updatedAt: now }).where(inArray(leads.id, ids));
        break;
      case "dnc": {
        await db
          .update(leads)
          .set({ status: "do_not_call", nextFollowUpAt: null, updatedAt: now })
          .where(inArray(leads.id, ids));
        for (const t of targets) {
          await addPhoneToDnc(ctx.org.id, t.phone, ctx.user.id, "Bulk action");
        }
        break;
      }
    }

    for (const t of targets) {
      await recordActivity({
        leadId: t.id,
        userId: ctx.user.id,
        type: data.action === "assign" ? "assignment" : data.action === "status" ? "status_change" : "field_change",
        body: `Bulk: ${data.action}`,
        toValue: { action: data.action, status: data.status, assignedTo: data.assignedTo, tag: data.tag },
      });
    }

    touchPaths();
    return { ok: true, data: { affected: targets.length } };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ */
/* Create / DNC                                                        */
/* ------------------------------------------------------------------ */

export async function createLead(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireSession();
    const data = createLeadSchema.parse(input);

    const phone = normalisePhone(data.phonePrimary);
    if (!phone.e164) return { ok: false, error: "That phone number could not be read." };

    const [blocked] = await db
      .select({ id: doNotCall.id })
      .from(doNotCall)
      .where(and(eq(doNotCall.orgId, ctx.org.id), eq(doNotCall.phone, phone.e164)))
      .limit(1);

    const [row] = await db
      .insert(leads)
      .values({
        orgId: ctx.org.id,
        teamId: ctx.team.id,
        fullName: data.fullName.trim(),
        company: data.company?.trim() || null,
        jobTitle: data.jobTitle?.trim() || null,
        phonePrimary: phone.e164,
        email: data.email?.trim() || null,
        city: data.city?.trim() || null,
        source: data.source,
        tags: data.tags ?? [],
        assignedTo: data.assignedTo ?? ctx.user.id,
        createdBy: ctx.user.id,
        status: blocked ? "do_not_call" : "new",
      })
      .returning({ id: leads.id });

    if (!row) return { ok: false, error: "Could not create that lead." };

    await recordActivity({
      leadId: row.id,
      userId: ctx.user.id,
      type: "import",
      body: "Created manually",
    });

    touchPaths();
    return {
      ok: true,
      data: { id: row.id },
      message: blocked ? "Added, but this number is on the DNC list." : undefined,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function addToDnc(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await requireSession();
    await assertCanManageTeam(ctx.user.id, ctx.team.id);
    const data = dncSchema.parse(input);
    const phone = normalisePhone(data.phone);
    if (!phone.e164) return { ok: false, error: "That phone number could not be read." };

    await addPhoneToDnc(ctx.org.id, phone.e164, ctx.user.id, data.reason);
    revalidatePath("/settings/dnc");
    touchPaths();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Bulk paste from a spreadsheet or a WhatsApp list. Every number is normalised
 * before insert, so the list dedupes on the same E.164 value the leads do.
 */
export async function bulkAddToDnc(
  input: unknown,
): Promise<ActionResult<{ added: number; alreadyThere: number; unreadable: string[] }>> {
  try {
    const ctx = await requireSession();
    await assertCanManageTeam(ctx.user.id, ctx.team.id);
    const data = bulkDncSchema.parse(input);

    const unreadable: string[] = [];
    const numbers = new Set<string>();
    for (const raw of data.text.split(/[\n,;]/)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const phone = normalisePhone(trimmed);
      if (phone.e164) numbers.add(phone.e164);
      else if (unreadable.length < 20) unreadable.push(trimmed);
    }
    if (numbers.size === 0) {
      return { ok: false, error: "None of those lines look like phone numbers." };
    }

    const before = await db
      .select({ phone: doNotCall.phone })
      .from(doNotCall)
      .where(and(eq(doNotCall.orgId, ctx.org.id), inArray(doNotCall.phone, [...numbers])));
    const existing = new Set(before.map((r) => r.phone));

    for (const phone of numbers) {
      await addPhoneToDnc(ctx.org.id, phone, ctx.user.id, data.reason ?? "Bulk import");
    }

    revalidatePath("/settings/dnc");
    touchPaths();
    return {
      ok: true,
      data: { added: numbers.size - existing.size, alreadyThere: existing.size, unreadable },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function removeFromDnc(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireSession();
    await assertCanManageTeam(ctx.user.id, ctx.team.id);
    await db.delete(doNotCall).where(and(eq(doNotCall.id, id), eq(doNotCall.orgId, ctx.org.id)));
    revalidatePath("/settings/dnc");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/**
 * DNC is enforced org-wide: adding a number both records it and force-sets
 * every matching lead so it drops out of every call queue immediately.
 */
async function addPhoneToDnc(orgId: string, phone: string, userId: string, reason?: string) {
  await db
    .insert(doNotCall)
    .values({ orgId, phone, reason: reason ?? null, addedBy: userId })
    .onConflictDoNothing();

  await db
    .update(leads)
    .set({ status: "do_not_call", nextFollowUpAt: null, updatedAt: new Date() })
    .where(and(eq(leads.orgId, orgId), eq(leads.phonePrimary, phone)));
}

export async function markNotificationsRead(): Promise<void> {
  const ctx = await requireSession();
  const { notifications } = await import("@/lib/db/schema");
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, ctx.user.id));
  revalidatePath("/today");
}

/** Round-robin assignment used by /import and by bulk reassign. */
export async function roundRobinAssign(teamId: string, userIds: string[], leadIds: string[]) {
  if (userIds.length === 0) return;
  for (let i = 0; i < leadIds.length; i++) {
    await db
      .update(leads)
      .set({ assignedTo: userIds[i % userIds.length]!, updatedAt: new Date() })
      .where(and(eq(leads.id, leadIds[i]!), eq(leads.teamId, teamId)));
  }
}

export async function teamMemberIds(teamId: string): Promise<string[]> {
  const rows = await db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.teamId, teamId));
  return rows.map((r) => r.id);
}

export async function assertViewable(userId: string, leadId: string) {
  await assertCanViewLead(userId, leadId);
}
