import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getPendingInvites, getRoster, getTeamsInOrg, getVisibilityGrants } from "@/lib/queries/settings";
import { PageBody } from "@/components/shell/app-shell";
import { MembersPanel, TeamsPanel } from "./members-panel";
import { VisibilityMatrix } from "./visibility-matrix";

export const metadata: Metadata = { title: "Team & access" };
export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const ctx = await requireSession();
  if (ctx.role === "agent") redirect("/settings/profile");

  const [roster, invites, grants, teams] = await Promise.all([
    getRoster(ctx.team.id),
    getPendingInvites(ctx.team.id),
    getVisibilityGrants(ctx.team.id),
    getTeamsInOrg(ctx.org.id),
  ]);

  return (
    <PageBody className="mx-auto max-w-5xl space-y-5">
      <MembersPanel
        teamId={ctx.team.id}
        viewerRole={ctx.role}
        viewerId={ctx.user.id}
        timezone={ctx.user.timezone}
        members={roster.map((m) => ({
          ...m,
          lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
        }))}
        invites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          token: i.token,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />

      <VisibilityMatrix
        teamId={ctx.team.id}
        grants={grants}
        members={roster
          .filter((m) => m.isActive)
          .map((m) => ({
            userId: m.userId,
            name: m.name,
            email: m.email,
            avatarUrl: m.avatarUrl,
            role: m.role,
          }))}
      />

      {ctx.role === "owner" && <TeamsPanel teams={teams} activeTeamId={ctx.team.id} />}
    </PageBody>
  );
}
