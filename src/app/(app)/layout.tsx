import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { signOutAction } from "@/lib/actions/auth";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, ctx.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(20);

  return (
    <AppShell
      ctx={ctx}
      signOutAction={signOutAction}
      notifications={rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      }))}
    >
      {children}
    </AppShell>
  );
}
