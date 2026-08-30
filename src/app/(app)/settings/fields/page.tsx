import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getCustomFields } from "@/lib/queries/settings";
import { PageBody } from "@/components/shell/app-shell";
import { FieldsPanel } from "./fields-panel";
import { can } from "@/lib/domain/roles";

export const metadata: Metadata = { title: "Custom fields" };
export const dynamic = "force-dynamic";

export default async function FieldsSettingsPage() {
  const ctx = await requireSession();
  if (!can(ctx.role, "data.curate")) redirect("/settings/profile");

  const fields = await getCustomFields(ctx.org.id);

  return (
    <PageBody className="mx-auto max-w-3xl space-y-5">
      <FieldsPanel fields={fields.map((f) => ({ ...f, options: f.options ?? [] }))} />
    </PageBody>
  );
}
