"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  customFieldDefs,
  leadVisibilityLinks,
  memberships,
  organizations,
  teams,
  users,
} from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageTeam, PermissionError } from "@/lib/auth/visibility";
import { customFieldSchema, roleSchema, targetsSchema, visibilityLinkSchema } from "./schemas";
import type { FormState } from "./auth";

function toState(error: unknown): FormState {
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: error.issues[0]?.message ?? "Check the form.",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  if (error instanceof PermissionError) return { ok: false, error: error.message };
  console.error("[admin-action]", error);
  return { ok: false, error: "Something went wrong. Try again." };
}

/* --------------------------- Visibility links ------------------------ */

/**
 * The matrix UI in /settings/team writes here. Each row is one direction:
 * granting Ali sight of Sara's leads never grants Sara sight of Ali's.
 */
export async function grantVisibility(input: unknown): Promise<FormState> {
  try {
    const ctx = await requireSession();
    const data = visibilityLinkSchema.parse(input);
    await assertCanManageTeam(ctx.user.id, data.teamId);
    if (data.viewerUserId === data.targetUserId) {
      return { ok: false, error: "Everyone already sees their own leads." };
    }
    await db
      .insert(leadVisibilityLinks)
      .values({ ...data, createdBy: ctx.user.id })
      .onConflictDoNothing();
    revalidatePath("/settings/team");
    return { ok: true };
  } catch (error) {
    return toState(error);
  }
}

export async function revokeVisibility(input: unknown): Promise<FormState> {
  try {
    const ctx = await requireSession();
    const data = visibilityLinkSchema.parse(input);
    await assertCanManageTeam(ctx.user.id, data.teamId);
    await db
      .delete(leadVisibilityLinks)
      .where(
        and(
          eq(leadVisibilityLinks.teamId, data.teamId),
          eq(leadVisibilityLinks.viewerUserId, data.viewerUserId),
          eq(leadVisibilityLinks.targetUserId, data.targetUserId),
        ),
      );
    revalidatePath("/settings/team");
    return { ok: true };
  } catch (error) {
    return toState(error);
  }
}

export async function toggleVisibility(input: unknown): Promise<FormState> {
  const data = visibilityLinkSchema.parse(input);
  const [existing] = await db
    .select({ id: leadVisibilityLinks.id })
    .from(leadVisibilityLinks)
    .where(
      and(
        eq(leadVisibilityLinks.teamId, data.teamId),
        eq(leadVisibilityLinks.viewerUserId, data.viewerUserId),
        eq(leadVisibilityLinks.targetUserId, data.targetUserId),
      ),
    )
    .limit(1);
  return existing ? revokeVisibility(data) : grantVisibility(data);
}

/* ------------------------------- Members ----------------------------- */

export async function changeRole(input: unknown): Promise<FormState> {
  try {
    const ctx = await requireSession();
    const data = z
      .object({ membershipId: z.string().uuid(), role: roleSchema })
      .parse(input);

    const [membership] = await db.select().from(memberships).where(eq(memberships.id, data.membershipId)).limit(1);
    if (!membership) return { ok: false, error: "That member is no longer on the team." };
    await assertCanManageTeam(ctx.user.id, membership.teamId);

    // Only an owner may mint another owner, and the last owner cannot step down.
    if (data.role === "owner" && ctx.role !== "owner") {
      return { ok: false, error: "Only an owner can make someone else an owner." };
    }
    if (membership.role === "owner" && data.role !== "owner") {
      const owners = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.teamId, membership.teamId), eq(memberships.role, "owner")));
      if (owners.length <= 1) return { ok: false, error: "A team needs at least one owner." };
    }

    await db.update(memberships).set({ role: data.role }).where(eq(memberships.id, data.membershipId));
    revalidatePath("/settings/team");
    return { ok: true };
  } catch (error) {
    return toState(error);
  }
}

export async function setTargets(input: unknown): Promise<FormState> {
  try {
    const ctx = await requireSession();
    const data = targetsSchema.parse(input);
    const [membership] = await db.select().from(memberships).where(eq(memberships.id, data.membershipId)).limit(1);
    if (!membership) return { ok: false, error: "That member is no longer on the team." };
    await assertCanManageTeam(ctx.user.id, membership.teamId);

    await db
      .update(memberships)
      .set({ dailyDialTarget: data.dailyDialTarget, dailyConnectTarget: data.dailyConnectTarget })
      .where(eq(memberships.id, data.membershipId));
    revalidatePath("/settings/team");
    return { ok: true, message: "Targets updated." };
  } catch (error) {
    return toState(error);
  }
}

export async function deactivateMember(userId: string): Promise<FormState> {
  try {
    const ctx = await requireSession();
    if (ctx.role !== "owner") return { ok: false, error: "Only an owner can deactivate someone." };
    if (userId === ctx.user.id) return { ok: false, error: "You cannot deactivate yourself." };
    await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
    revalidatePath("/settings/team");
    return { ok: true, message: "Member deactivated. Their leads are untouched." };
  } catch (error) {
    return toState(error);
  }
}

export async function reactivateMember(userId: string): Promise<FormState> {
  try {
    const ctx = await requireSession();
    if (ctx.role !== "owner") return { ok: false, error: "Only an owner can do that." };
    await db.update(users).set({ isActive: true }).where(eq(users.id, userId));
    revalidatePath("/settings/team");
    return { ok: true };
  } catch (error) {
    return toState(error);
  }
}

export async function createTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireSession();
    if (ctx.role !== "owner") return { ok: false, error: "Only an owner can create teams." };
    const name = z.string().min(1).max(120).parse(formData.get("name"));
    const [team] = await db.insert(teams).values({ orgId: ctx.org.id, name }).returning();
    await db.insert(memberships).values({ teamId: team!.id, userId: ctx.user.id, role: "owner" });
    revalidatePath("/settings/team");
    return { ok: true, message: `Team “${name}” created.` };
  } catch (error) {
    return toState(error);
  }
}

/* ---------------------------- Org settings --------------------------- */

export async function updateOrgSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireSession();
    if (ctx.role === "agent") return { ok: false, error: "Only team leads and owners can change this." };
    const data = z
      .object({
        name: z.string().min(1).max(120),
        timezone: z.string().min(1).max(64),
        callingWindowStart: z.coerce.number().int().min(0).max(23),
        callingWindowEnd: z.coerce.number().int().min(1).max(24),
      })
      .refine((v) => v.callingWindowEnd > v.callingWindowStart, {
        message: "The calling window has to end after it starts.",
        path: ["callingWindowEnd"],
      })
      .parse(Object.fromEntries(formData));

    await db.update(organizations).set(data).where(eq(organizations.id, ctx.org.id));
    revalidatePath("/settings");
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    return toState(error);
  }
}

/* --------------------------- Custom fields --------------------------- */

export async function upsertCustomField(input: unknown): Promise<FormState> {
  try {
    const ctx = await requireSession();
    if (ctx.role === "agent") return { ok: false, error: "Only team leads and owners can change fields." };
    const data = customFieldSchema.parse(input);

    if (data.id) {
      await db
        .update(customFieldDefs)
        .set({
          label: data.label,
          fieldType: data.fieldType,
          options: data.options,
          sortOrder: data.sortOrder,
        })
        .where(and(eq(customFieldDefs.id, data.id), eq(customFieldDefs.orgId, ctx.org.id)));
    } else {
      await db
        .insert(customFieldDefs)
        .values({ ...data, orgId: ctx.org.id })
        .onConflictDoUpdate({
          target: [customFieldDefs.orgId, customFieldDefs.key],
          set: { label: data.label, fieldType: data.fieldType, options: data.options, isActive: true },
        });
    }
    revalidatePath("/settings/fields");
    return { ok: true, message: "Field saved." };
  } catch (error) {
    return toState(error);
  }
}

export async function archiveCustomField(id: string): Promise<FormState> {
  try {
    const ctx = await requireSession();
    if (ctx.role === "agent") return { ok: false, error: "Only team leads and owners can change fields." };
    await db
      .update(customFieldDefs)
      .set({ isActive: false })
      .where(and(eq(customFieldDefs.id, id), eq(customFieldDefs.orgId, ctx.org.id)));
    revalidatePath("/settings/fields");
    return { ok: true };
  } catch (error) {
    return toState(error);
  }
}
