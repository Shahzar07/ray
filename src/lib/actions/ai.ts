"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { activities, leads } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanEditLead, assertCanViewLead, PermissionError } from "@/lib/auth/visibility";
import { AI_MESSAGE, aiEnabled } from "@/lib/ai/client";
import {
  coachObjection,
  draftFollowUp,
  followUpDateFrom,
  suggestFromNote,
  type NoteSuggestion,
  type ObjectionCoaching,
} from "@/lib/ai/features";
import { trialDay } from "@/lib/domain/dates";
import { addNote, updateLead, type ActionResult } from "./leads";

function fail(error: unknown): ActionResult<never> {
  if (error instanceof PermissionError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: "Check the input and try again." };
  console.error("[ai-action]", error);
  return { ok: false, error: "Something went wrong. Nothing was saved." };
}

/** Whether to render the AI affordances at all. */
export async function isAiEnabled(): Promise<boolean> {
  return aiEnabled;
}

/* ------------------------------------------------------------------ */
/* Note → structured update                                            */
/* ------------------------------------------------------------------ */

export type NoteSuggestionResult = NoteSuggestion & { followUpAt: string | null };

/**
 * Reads the note and returns a suggestion. Writes nothing — the caller
 * confirms with one tap and `applyNoteSuggestion` does the writing through
 * the ordinary guarded path.
 */
export async function suggestFromNoteAction(input: unknown): Promise<ActionResult<NoteSuggestionResult>> {
  try {
    const ctx = await requireSession();
    const data = z
      .object({ leadId: z.string().uuid(), note: z.string().min(4).max(4000) })
      .parse(input);
    await assertCanViewLead(ctx.user.id, data.leadId);

    const [lead] = await db
      .select({
        status: leads.status,
        interestLevel: leads.interestLevel,
        company: leads.company,
        attemptsCount: leads.attemptsCount,
      })
      .from(leads)
      .where(eq(leads.id, data.leadId))
      .limit(1);
    if (!lead) return { ok: false, error: "That lead no longer exists." };

    const result = await suggestFromNote(data.note, {
      status: lead.status,
      interestLevel: lead.interestLevel,
      company: lead.company,
      attempts: lead.attemptsCount,
    });

    if (!result.ok) return { ok: false, error: AI_MESSAGE[result.reason] };

    const followUpAt = followUpDateFrom(result.data);
    return { ok: true, data: { ...result.data, followUpAt: followUpAt?.toISOString() ?? null } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Applies a suggestion the caller accepted. Every field goes through
 * `updateLead`, so the permission guard, the Zod schema and the activity log
 * are exactly the same as a manual edit — the AI gets no privileged path.
 */
export async function applyNoteSuggestion(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await requireSession();
    const data = z
      .object({
        leadId: z.string().uuid(),
        note: z.string().min(1).max(4000),
        status: z.string().optional(),
        interestLevel: z.string().nullish(),
        followUpAt: z.string().nullish(),
        followUpChannel: z.string().nullish(),
        tags: z.array(z.string().max(40)).max(5).optional(),
      })
      .parse(input);

    await assertCanEditLead(ctx.user.id, data.leadId);

    const noteResult = await addNote({ leadId: data.leadId, body: data.note, aiGenerated: true });
    if (!noteResult.ok) return noteResult;

    const patch: Record<string, unknown> = { leadId: data.leadId };
    if (data.status) patch.status = data.status;
    if (data.interestLevel !== undefined && data.interestLevel !== null) patch.interestLevel = data.interestLevel;
    if (data.followUpAt) {
      patch.nextFollowUpAt = data.followUpAt;
      patch.followUpChannel = data.followUpChannel ?? "call";
    }
    if (data.tags && data.tags.length > 0) {
      const [current] = await db.select({ tags: leads.tags }).from(leads).where(eq(leads.id, data.leadId)).limit(1);
      patch.tags = [...new Set([...(current?.tags ?? []), ...data.tags])].slice(0, 20);
    }

    if (Object.keys(patch).length > 1) {
      const updated = await updateLead(patch);
      if (!updated.ok) return updated;
    }

    revalidatePath("/leads");
    return { ok: true, message: "Saved from your note." };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ */
/* Objection coach                                                     */
/* ------------------------------------------------------------------ */

export async function coachObjectionAction(input: unknown): Promise<ActionResult<ObjectionCoaching>> {
  try {
    const ctx = await requireSession();
    const data = z
      .object({ leadId: z.string().uuid(), objection: z.string().min(4).max(500) })
      .parse(input);
    await assertCanViewLead(ctx.user.id, data.leadId);

    /* Grounded in this team's own history, not a generic script: notes from
       leads that actually converted, most recent first. */
    const won = await db
      .select({ body: activities.body })
      .from(activities)
      .innerJoin(leads, eq(leads.id, activities.leadId))
      .where(
        and(
          eq(leads.teamId, ctx.team.id),
          eq(leads.status, "converted"),
          eq(activities.type, "note"),
          isNotNull(activities.body),
          sql`length(${activities.body}) > 30`,
        ),
      )
      .orderBy(desc(activities.createdAt))
      .limit(15);

    const result = await coachObjection(
      data.objection,
      won.map((row) => row.body ?? "").filter(Boolean),
    );
    if (!result.ok) return { ok: false, error: AI_MESSAGE[result.reason] };
    return { ok: true, data: result.data };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ */
/* Follow-up drafting                                                  */
/* ------------------------------------------------------------------ */

export async function draftFollowUpAction(input: unknown): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireSession();
    const data = z
      .object({ leadId: z.string().uuid(), channel: z.enum(["whatsapp", "email"]) })
      .parse(input);
    await assertCanViewLead(ctx.user.id, data.leadId);

    const [lead] = await db
      .select({
        fullName: leads.fullName,
        company: leads.company,
        status: leads.status,
        trialStartedAt: leads.trialStartedAt,
        trialStatus: leads.trialStatus,
      })
      .from(leads)
      .where(eq(leads.id, data.leadId))
      .limit(1);
    if (!lead) return { ok: false, error: "That lead no longer exists." };

    const notes = await db
      .select({ body: activities.body })
      .from(activities)
      .where(
        and(
          eq(activities.leadId, data.leadId),
          isNotNull(activities.body),
          ne(activities.type, "import"),
        ),
      )
      .orderBy(desc(activities.createdAt))
      .limit(6);

    const result = await draftFollowUp({
      channel: data.channel,
      leadName: lead.fullName,
      company: lead.company,
      status: lead.status,
      trialDay: lead.trialStatus === "active" ? trialDay(lead.trialStartedAt) : null,
      notes: notes.map((n) => n.body ?? "").filter(Boolean),
      senderName: ctx.user.name,
    });

    if (!result.ok) return { ok: false, error: AI_MESSAGE[result.reason] };
    return { ok: true, data: result.data };
  } catch (error) {
    return fail(error);
  }
}
