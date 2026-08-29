import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shell/app-shell";
import { SettingsNav } from "./settings-ui";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();

  return (
    <>
      <PageHeader title="Settings" subtitle={ctx.org.name}>
        <SettingsNav role={ctx.role} />
      </PageHeader>
      {children}
    </>
  );
}
