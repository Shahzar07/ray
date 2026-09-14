"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { endSession, openSession, startSession } from "@/lib/db/attendance";

export async function attendanceStatus() {
  const ctx = await requireSession();
  try {
    const session = await openSession(ctx.user.id);
    return {
      ok: true as const,
      session: session
        ? { id: session.id, startedAt: session.startedAt.toISOString() }
        : null,
      serverNow: new Date().toISOString(),
    };
  } catch {
    return {
      ok: false as const,
      error: "Attendance is temporarily unavailable. You can continue working.",
    };
  }
}
export async function clockIn() {
  const ctx = await requireSession();
  try {
    await startSession(ctx);
    revalidatePath("/timesheet");
    revalidatePath("/attendance");
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "Could not check in. Please try again.",
    };
  }
}
export async function clockOut(id: string) {
  const ctx = await requireSession();
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false as const, error: "Invalid session." };
  try {
    await endSession(ctx.user.id, parsed.data);
    revalidatePath("/timesheet");
    revalidatePath("/attendance");
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error:
        "Could not check out. Your session is still recorded; please retry.",
    };
  }
}
