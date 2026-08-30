import type { Metadata } from "next";
import { requireSession, teamMembers } from "@/lib/auth/session";
import { visibleUserIds } from "@/lib/auth/visibility";
import { getBoardCards } from "@/lib/queries/board";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { BoardClient } from "./board-client";
import { can } from "@/lib/domain/roles";

export const metadata: Metadata = { title: "Board" };
export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireSession();
  const params = await searchParams;
  const assignee = typeof params.assignee === "string" ? params.assignee : "";

  const [cards, members, allowed] = await Promise.all([
    getBoardCards(ctx.user.id, ctx.team.id, assignee || undefined),
    teamMembers(ctx.team.id),
    visibleUserIds(ctx.user.id, ctx.team.id),
  ]);

  // The assignee filter only ever offers people this user may see leads for.
  const visible = members.filter((m) => allowed.includes(m.id));

  return (
    <>
      <PageHeader title="Board" subtitle="The open pipeline, one column per stage" />
      <PageBody>
        <BoardClient
          tz={ctx.user.timezone}
          assignee={assignee}
          canReassign={can(ctx.role, "leads.manageAll")}
          members={visible.map((m) => ({ id: m.id, name: m.name, email: m.email, avatarUrl: m.avatarUrl }))}
          cards={cards.map((card) => ({
            ...card,
            nextFollowUpAt: card.nextFollowUpAt?.toISOString() ?? null,
            stageSince: card.stageSince.toISOString(),
          }))}
        />
      </PageBody>
    </>
  );
}
