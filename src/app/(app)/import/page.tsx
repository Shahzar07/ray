import type { Metadata } from "next";
import { requireTeamManager, teamMembers } from "@/lib/auth/session";
import { getImportBatches, getMappableCustomFields } from "@/lib/queries/import";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ImportWizard } from "./import-wizard";
import { BatchHistory } from "./batch-history";

import { APP_SHORT_NAME } from "@/lib/domain/constants";
export const metadata: Metadata = { title: "Import" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ctx = await requireTeamManager();
  const [members, customFields, batches] = await Promise.all([
    teamMembers(ctx.team.id),
    getMappableCustomFields(ctx.org.id),
    getImportBatches(ctx.team.id),
  ]);

  return (
    <>
      <PageHeader
        title="Import"
        subtitle={`Move a scraped sheet into ${APP_SHORT_NAME} — mapped, de-duplicated and assigned in one pass`}
      />
      <PageBody className="mx-auto max-w-6xl space-y-6">
        <ImportWizard
          members={members.map((m) => ({ id: m.id, name: m.name, email: m.email, avatarUrl: m.avatarUrl }))}
          customFields={customFields}
          currentUserId={ctx.user.id}
        />
        <BatchHistory
          timezone={ctx.user.timezone}
          batches={batches.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() }))}
        />
      </PageBody>
    </>
  );
}
