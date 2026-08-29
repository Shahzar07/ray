import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { getStorageUsage } from "@/lib/queries/settings";
import { PageBody } from "@/components/shell/app-shell";
import { GeneralForm } from "./general-form";
import { StorageCard } from "./storage-card";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const ctx = await requireSession();
  if (ctx.role === "agent") redirect("/settings/profile");

  const [[org], usage] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, ctx.org.id)).limit(1),
    getStorageUsage(),
  ]);
  if (!org) redirect("/today");

  return (
    <PageBody className="mx-auto max-w-3xl space-y-5">
      <GeneralForm
        org={{
          name: org.name,
          timezone: org.timezone,
          callingWindowStart: org.callingWindowStart,
          callingWindowEnd: org.callingWindowEnd,
          cadenceEnabled: org.cadenceEnabled,
          cadenceMaxAttempts: org.cadenceMaxAttempts,
          cadenceWindowDays: org.cadenceWindowDays,
        }}
      />
      <StorageCard usage={usage} />
    </PageBody>
  );
}
