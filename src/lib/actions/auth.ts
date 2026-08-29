"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { addDays } from "date-fns";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AuthError } from "next-auth";
import { db } from "@/lib/db/client";
import { invites, memberships, organizations, teams, users } from "@/lib/db/schema";
import { hashPassword, signIn, signOut } from "@/lib/auth";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageTeam, PermissionError } from "@/lib/auth/visibility";
import { acceptInviteSchema, inviteSchema, passwordSchema, profileSchema, signupOwnerSchema } from "./schemas";

export type FormState = { ok: boolean; error?: string; fieldErrors?: Record<string, string[]>; message?: string };

const OK: FormState = { ok: true };

function toState(error: unknown): FormState {
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: error.issues[0]?.message ?? "Check the form.",
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  if (error instanceof PermissionError) return { ok: false, error: error.message };
  console.error("[auth-action]", error);
  return { ok: false, error: "Something went wrong. Try again." };
}

/* ------------------------------- Sign in ----------------------------- */

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };

  try {
    await signIn("credentials", { email, password, redirectTo: "/today" });
    return OK;
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "That email and password don't match an account." };
    }
    throw error; // Next's redirect throws — let it through.
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/* -------------------------- First-run: owner ------------------------- */

/** Only usable while the database has no users — the bootstrap path. */
export async function createFirstOwner(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const [existing] = await db.select({ id: users.id }).from(users).limit(1);
    if (existing) return { ok: false, error: "This CallDesk is already set up. Sign in instead." };

    const data = signupOwnerSchema.parse(Object.fromEntries(formData));

    const [org] = await db
      .insert(organizations)
      .values({ name: data.orgName, timezone: data.timezone })
      .returning();
    const [team] = await db
      .insert(teams)
      .values({ orgId: org!.id, name: data.teamName })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        name: data.name,
        email: data.email.trim().toLowerCase(),
        passwordHash: await hashPassword(data.password),
        timezone: data.timezone,
      })
      .returning();
    await db.insert(memberships).values({ teamId: team!.id, userId: user!.id, role: "owner" });
  } catch (error) {
    return toState(error);
  }
  redirect("/login?welcome=1");
}

/* --------------------------- Invite flow ----------------------------- */

/**
 * No email service (the brief caps recurring cost at $0), so an invite is a
 * signed link the owner copies out of the members table and sends themselves.
 */
export async function createInvite(input: unknown): Promise<FormState & { url?: string }> {
  try {
    const ctx = await requireSession();
    const data = inviteSchema.parse(input);
    await assertCanManageTeam(ctx.user.id, data.teamId);

    const email = data.email.trim().toLowerCase();
    const [already] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(and(eq(users.email, email), eq(memberships.teamId, data.teamId)))
      .limit(1);
    if (already) return { ok: false, error: "That person is already on this team." };

    const token = randomBytes(24).toString("base64url");
    await db.insert(invites).values({
      teamId: data.teamId,
      email,
      role: data.role,
      token,
      invitedBy: ctx.user.id,
      expiresAt: addDays(new Date(), 14),
    });

    revalidatePath("/settings/team");
    return { ok: true, url: `/invite/${token}`, message: "Invite link ready — copy and send it." };
  } catch (error) {
    return toState(error);
  }
}

export async function revokeInvite(id: string): Promise<FormState> {
  try {
    const ctx = await requireSession();
    const [invite] = await db.select().from(invites).where(eq(invites.id, id)).limit(1);
    if (!invite) return { ok: false, error: "That invite is already gone." };
    await assertCanManageTeam(ctx.user.id, invite.teamId);
    await db.delete(invites).where(eq(invites.id, id));
    revalidatePath("/settings/team");
    return OK;
  } catch (error) {
    return toState(error);
  }
}

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  let email: string;
  let password: string;
  try {
    const data = acceptInviteSchema.parse(Object.fromEntries(formData));

    const [invite] = await db.select().from(invites).where(eq(invites.token, data.token)).limit(1);
    if (!invite) return { ok: false, error: "That invite link is not valid." };
    if (invite.acceptedAt) return { ok: false, error: "That invite has already been used." };
    if (invite.expiresAt < new Date()) return { ok: false, error: "That invite has expired. Ask for a new link." };

    email = invite.email;
    password = data.password;

    const [existing] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);
    const userId = existing
      ? existing.id
      : (
          await db
            .insert(users)
            .values({
              name: data.name,
              email: invite.email,
              passwordHash: await hashPassword(data.password),
              timezone: data.timezone,
            })
            .returning({ id: users.id })
        )[0]!.id;

    await db
      .insert(memberships)
      .values({ teamId: invite.teamId, userId, role: invite.role })
      .onConflictDoNothing();
    await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  } catch (error) {
    return toState(error);
  }

  await signIn("credentials", { email, password, redirectTo: "/today" });
  return OK;
}

/* ----------------------------- Profile ------------------------------- */

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireSession();
    const data = profileSchema.parse(Object.fromEntries(formData));
    await db
      .update(users)
      .set({ name: data.name, phone: data.phone || null, timezone: data.timezone })
      .where(eq(users.id, ctx.user.id));
    revalidatePath("/settings/profile");
    return { ok: true, message: "Profile saved." };
  } catch (error) {
    return toState(error);
  }
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireSession();
    const data = passwordSchema.parse(Object.fromEntries(formData));

    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!user?.passwordHash) return { ok: false, error: "This account has no password set." };
    if (!(await bcrypt.compare(data.current, user.passwordHash))) {
      return { ok: false, error: "That is not your current password.", fieldErrors: { current: ["Incorrect"] } };
    }

    await db.update(users).set({ passwordHash: await hashPassword(data.next) }).where(eq(users.id, ctx.user.id));
    return { ok: true, message: "Password changed." };
  } catch (error) {
    return toState(error);
  }
}
