"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Check,
  Copy,
  Link2,
  MoreHorizontal,
  Plus,
  Target,
  UserMinus,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import {
  Avatar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/controls";
import { RoleBadge } from "@/components/ui/display";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { changeRole, createTeam, deactivateMember, reactivateMember, setTargets } from "@/lib/actions/admin";
import { createInvite, revokeInvite } from "@/lib/actions/auth";
import { ROLE } from "@/lib/domain/constants";
import { fmtDate, relative } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/db/schema";
import { FormAlert } from "../settings-ui";

export type PanelMember = {
  userId: string;
  membershipId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: Role;
  isActive: boolean;
  dailyDialTarget: number;
  dailyConnectTarget: number;
  lastSeenAt: string | null;
  leadCount: number;
};

export type PanelInvite = {
  id: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: string;
};

export function MembersPanel({
  members,
  invites,
  teamId,
  viewerRole,
  viewerId,
  timezone,
}: {
  members: PanelMember[];
  invites: PanelInvite[];
  teamId: string;
  viewerRole: Role;
  viewerId: string;
  timezone: string;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [targetsFor, setTargetsFor] = React.useState<PanelMember | null>(null);

  function updateRole(member: PanelMember, role: Role) {
    startTransition(async () => {
      const result = await changeRole({ membershipId: member.membershipId, role });
      toast(
        result.ok
          ? { title: `${member.name ?? member.email} is now ${ROLE[role].label.toLowerCase()}`, tone: "success" }
          : { title: "Role unchanged", description: result.error, tone: "danger" },
      );
    });
  }

  function toggleActive(member: PanelMember) {
    startTransition(async () => {
      const result = member.isActive ? await deactivateMember(member.userId) : await reactivateMember(member.userId);
      toast(
        result.ok
          ? {
              title: member.isActive ? `${member.name ?? member.email} deactivated` : `${member.name ?? member.email} is back`,
              description: result.message,
              tone: "success",
            }
          : { title: "Could not do that", description: result.error, tone: "danger" },
      );
    });
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Roles decide reach: an owner sees the whole org, a team lead sees this team, an agent sees only their
              own leads plus anything granted below.
            </CardDescription>
          </div>
          <InviteDialog teamId={teamId} />
        </CardHeader>

        <ul className="divide-y divide-[var(--line)] border-t border-line">
          {members.map((member) => (
            <li
              key={member.membershipId}
              className={cn("flex flex-wrap items-center gap-3 px-5 py-3", !member.isActive && "opacity-60")}
            >
              <Avatar name={member.name} src={member.avatarUrl} size="md" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13.5px] font-medium text-strong">{member.name ?? member.email}</p>
                  {member.userId === viewerId && (
                    <Badge tone="neutral" size="xs">
                      you
                    </Badge>
                  )}
                  {!member.isActive && (
                    <Badge tone="danger" size="xs">
                      deactivated
                    </Badge>
                  )}
                </div>
                <p className="truncate text-[12px] text-muted">{member.email}</p>
              </div>

              <div className="hidden text-right sm:block">
                <p className="text-[12.5px] tabular-nums text-body">{member.leadCount.toLocaleString()} leads</p>
                <p className="text-[11.5px] text-subtle">
                  {member.lastSeenAt ? `seen ${relative(member.lastSeenAt)}` : "never signed in"}
                </p>
              </div>

              <div className="hidden text-right lg:block">
                <p className="text-[12.5px] tabular-nums text-body">
                  {member.dailyDialTarget}/{member.dailyConnectTarget}
                </p>
                <p className="text-[11.5px] text-subtle">dials / connects</p>
              </div>

              {viewerRole === "agent" ? (
                <RoleBadge role={member.role} />
              ) : (
                <Select value={member.role} onValueChange={(v) => updateRole(member, v as Role)} disabled={pending}>
                  <SelectTrigger size="sm" className="w-[132px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE) as Role[]).map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE[role].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {viewerRole !== "agent" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`More for ${member.name ?? member.email}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setTargetsFor(member)}>
                      <Target />
                      Daily targets
                    </DropdownMenuItem>
                    {viewerRole === "owner" && member.userId !== viewerId && (
                      <DropdownMenuItem
                        destructive={member.isActive}
                        onSelect={() => toggleActive(member)}
                      >
                        {member.isActive ? <UserMinus /> : <UserRoundCheck />}
                        {member.isActive ? "Deactivate" : "Reactivate"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>

        {invites.length > 0 && (
          <div className="border-t border-line bg-sunken px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              Invites waiting to be accepted
            </p>
            <ul className="space-y-1.5">
              {invites.map((invite) => (
                <InviteRow key={invite.id} invite={invite} timezone={timezone} />
              ))}
            </ul>
          </div>
        )}
      </Card>

      {targetsFor && (
        <TargetsDialog member={targetsFor} onClose={() => setTargetsFor(null)} />
      )}
    </>
  );
}

/* ------------------------------- Invites ----------------------------- */

function InviteDialog({ teamId }: { teamId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createInvite({
        teamId,
        email: String(formData.get("email") ?? ""),
        role: String(formData.get("role") ?? "agent"),
      });
      if (!result.ok || !result.url) {
        setError(result.error ?? "Could not create that invite.");
        return;
      }
      setError(null);
      setLink(`${window.location.origin}${result.url}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setLink(null);
          setError(null);
        }
      }}
    >
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus />
        Invite
      </Button>
      <DialogContent
        title="Invite someone"
        description="CallDesk sends no email — you copy the link and send it however you like."
        className="max-w-[440px]"
      >
        {link ? (
          <>
            <DialogBody>
              <p className="text-[13px] text-body">
                Send this link. It works once and expires in 14 days.
              </p>
              <CopyField value={link} />
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLink(null)}>
                Invite someone else
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form action={submit}>
            <DialogBody>
              {error && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
                  {error}
                </p>
              )}
              <Field label="Email" htmlFor="invite-email">
                <Input id="invite-email" name="email" type="email" required autoFocus placeholder="sara@company.com" />
              </Field>
              <Field label="Role" htmlFor="invite-role">
                <Select name="role" defaultValue="agent">
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE) as Role[]).map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE[role].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                <Link2 />
                Create link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard blocked — the text is selectable in the field. */
    }
  }

  return (
    <div className="flex gap-2">
      <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[12px]" />
      <Button variant="secondary" onClick={copy} className="shrink-0">
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function InviteRow({ invite, timezone }: { invite: PanelInvite; timezone: string }) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [copied, setCopied] = React.useState(false);

  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[13px] text-body">{invite.email}</span>
      <RoleBadge role={invite.role} size="xs" />
      <span className="text-[11.5px] text-subtle">expires {fmtDate(invite.expiresAt, timezone)}</span>
      <Button
        variant="ghost"
        size="xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.token}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            toast({ title: "Clipboard blocked", description: "Copy the link from the invite dialog instead.", tone: "warning" });
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <Button
        variant="ghost"
        size="xs"
        loading={pending}
        className="text-danger-text"
        onClick={() =>
          startTransition(async () => {
            const result = await revokeInvite(invite.id);
            if (!result.ok) toast({ title: "Could not revoke", description: result.error, tone: "danger" });
          })
        }
      >
        Revoke
      </Button>
    </li>
  );
}

/* ------------------------------- Targets ----------------------------- */

function TargetsDialog({ member, onClose }: { member: PanelMember; onClose: () => void }) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await setTargets({
        membershipId: member.membershipId,
        dailyDialTarget: Number(formData.get("dailyDialTarget")),
        dailyConnectTarget: Number(formData.get("dailyConnectTarget")),
      });
      toast(
        result.ok
          ? { title: `Targets updated for ${member.name ?? member.email}`, tone: "success" }
          : { title: "Not saved", description: result.error, tone: "danger" },
      );
      if (result.ok) onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={`Daily targets — ${member.name ?? member.email}`}
        description="Drives the progress rings on Today and the pace shown in Call Mode."
        className="max-w-[400px]"
      >
        <form action={submit}>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dials a day" htmlFor="dials">
                <Input
                  id="dials"
                  name="dailyDialTarget"
                  type="number"
                  min={0}
                  max={500}
                  defaultValue={member.dailyDialTarget}
                  className="tabular-nums"
                  autoFocus
                />
              </Field>
              <Field label="Connects a day" htmlFor="connects">
                <Input
                  id="connects"
                  name="dailyConnectTarget"
                  type="number"
                  min={0}
                  max={500}
                  defaultValue={member.dailyConnectTarget}
                  className="tabular-nums"
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Save targets
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Teams ------------------------------ */

export function TeamsPanel({
  teams,
  activeTeamId,
}: {
  teams: Array<{ id: string; name: string; memberCount: number; leadCount: number }>;
  activeTeamId: string;
}) {
  const [state, action, pending] = useActionState(createTeam, { ok: true });

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Teams</CardTitle>
          <CardDescription>
            A second team keeps two lead pools apart. Leads never cross a team boundary, whatever the role.
          </CardDescription>
        </div>
      </CardHeader>
      <ul className="divide-y divide-[var(--line)] border-t border-line">
        {teams.map((team) => (
          <li key={team.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-strong">
                {team.name}
                {team.id === activeTeamId && (
                  <Badge tone="accent" size="xs" className="ml-2">
                    current
                  </Badge>
                )}
              </p>
              <p className="text-[12px] text-muted">
                {team.memberCount} {team.memberCount === 1 ? "member" : "members"} ·{" "}
                {team.leadCount.toLocaleString()} leads
              </p>
            </div>
          </li>
        ))}
      </ul>
      <form action={action} className="space-y-3 border-t border-line bg-sunken px-5 py-3.5">
        <FormAlert state={state} />
        <div className="flex gap-2">
          <Input name="name" placeholder="New team name" required maxLength={120} className="h-8" />
          <Button type="submit" variant="secondary" size="sm" loading={pending} className="shrink-0">
            <Plus />
            Add team
          </Button>
        </div>
      </form>
    </Card>
  );
}
