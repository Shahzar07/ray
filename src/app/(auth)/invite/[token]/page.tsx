import { eq } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { invites, organizations, teams } from "@/lib/db/schema";
import { ROLE } from "@/lib/domain/constants";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Accept invite" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [invite] = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      acceptedAt: invites.acceptedAt,
      expiresAt: invites.expiresAt,
      teamName: teams.name,
      orgName: organizations.name,
    })
    .from(invites)
    .innerJoin(teams, eq(teams.id, invites.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .where(eq(invites.token, token))
    .limit(1);

  const problem = !invite
    ? "That invite link is not valid."
    : invite.acceptedAt
      ? "That invite has already been used."
      : invite.expiresAt < new Date()
        ? "That invite has expired. Ask your team lead for a fresh link."
        : null;

  if (problem || !invite) {
    return (
      <div className="space-y-5">
        <h1 className="text-[24px] font-semibold tracking-tight text-strong">Invite unavailable</h1>
        <p className="text-[13.5px] leading-relaxed text-muted">{problem}</p>
        <Link href="/login" className="text-[13px] font-medium text-accent-text hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-[24px] font-semibold tracking-tight text-strong">
          Join {invite.orgName}
        </h1>
        <p className="text-[13.5px] leading-relaxed text-muted">
          You&rsquo;ve been invited to the <span className="font-medium text-strong">{invite.teamName}</span> team as{" "}
          <Badge tone={ROLE[invite.role].tone} size="xs">
            {ROLE[invite.role].label}
          </Badge>
          . Set a password and you&rsquo;re in.
        </p>
      </div>

      <InviteForm token={token} email={invite.email} />
    </div>
  );
}
