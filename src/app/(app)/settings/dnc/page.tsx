import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDncCount, getDncList } from "@/lib/queries/settings";
import { PageBody } from "@/components/shell/app-shell";
import { DncPanel } from "./dnc-panel";
import { can } from "@/lib/domain/roles";

export const metadata: Metadata = { title: "Do-not-call" };
export const dynamic = "force-dynamic";

export default async function DncSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireSession();
  if (!can(ctx.role, "data.curate")) redirect("/settings/profile");

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";

  const [entries, total] = await Promise.all([getDncList(ctx.org.id, search), getDncCount(ctx.org.id)]);

  return (
    <PageBody className="mx-auto max-w-4xl space-y-5">
      <DncPanel
        total={total}
        search={search}
        timezone={ctx.user.timezone}
        entries={entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
      />
    </PageBody>
  );
}
