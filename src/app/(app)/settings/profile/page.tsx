import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { PageBody } from "@/components/shell/app-shell";
import { PasswordForm, ProfileForm } from "./profile-forms";

export const metadata: Metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const ctx = await requireSession();
  const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);

  return (
    <PageBody className="mx-auto max-w-3xl space-y-5">
      <ProfileForm
        role={ctx.role}
        teamName={ctx.team.name}
        user={{
          name: ctx.user.name,
          email: ctx.user.email,
          phone: user?.phone ?? null,
          timezone: ctx.user.timezone,
          avatarUrl: ctx.user.avatarUrl,
        }}
      />
      <PasswordForm />
    </PageBody>
  );
}
