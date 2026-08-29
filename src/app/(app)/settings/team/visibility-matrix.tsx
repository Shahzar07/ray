"use client";

import * as React from "react";
import { ArrowRight, Check, Eye, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { toggleVisibility } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/db/schema";

export type MatrixMember = {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: Role;
};

/**
 * The asymmetry is the whole point, so the UI states the direction in words
 * on every cell: the row *sees* the column. Owners and team leads are shown
 * as covered by their role rather than as toggles, because no row in
 * `lead_visibility_links` is what grants them anything.
 */
export function VisibilityMatrix({
  teamId,
  members,
  grants,
}: {
  teamId: string;
  members: MatrixMember[];
  grants: Record<string, string[]>;
}) {
  const { toast } = useToast();
  const [state, setState] = React.useState(grants);
  const [busy, setBusy] = React.useState<string | null>(null);

  const agents = members.filter((m) => m.role === "agent");

  async function toggle(viewer: MatrixMember, target: MatrixMember) {
    const key = `${viewer.userId}:${target.userId}`;
    const had = state[viewer.userId]?.includes(target.userId) ?? false;

    setBusy(key);
    setState((prev) => ({
      ...prev,
      [viewer.userId]: had
        ? (prev[viewer.userId] ?? []).filter((id) => id !== target.userId)
        : [...(prev[viewer.userId] ?? []), target.userId],
    }));

    const result = await toggleVisibility({
      teamId,
      viewerUserId: viewer.userId,
      targetUserId: target.userId,
    });
    setBusy(null);

    if (!result.ok) {
      setState(grants);
      toast({ title: "Could not change that", description: result.error, tone: "danger" });
      return;
    }
    const viewerName = viewer.name ?? viewer.email;
    const targetName = target.name ?? target.email;
    toast({
      title: had ? `${viewerName} can no longer see ${targetName}'s leads` : `${viewerName} can now see ${targetName}'s leads`,
      description: had ? undefined : `This does not let ${targetName} see ${viewerName}'s leads.`,
      tone: had ? "info" : "success",
    });
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Who can see whose leads</CardTitle>
            <CardDescription>
              Owners and team leads already see every lead in the team. This grid appears once there are agents to
              grant extra sight to.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Who can see whose leads</CardTitle>
          <CardDescription>
            Tick a cell to let the person on the left see the leads of the person along the top. Grants are
            one-directional — the reverse cell stays untouched until you tick it too.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded bg-accent text-accent-fg">
              <Check className="size-2.5" strokeWidth={3.5} />
            </span>
            Granted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded bg-inset text-subtle">
              <Eye className="size-2.5" />
            </span>
            Their own leads
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Shield className="size-3.5 text-info" />
            Covered by their role
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-3 pb-2 text-left align-bottom">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                    Sees <ArrowRight className="size-3" />
                  </span>
                </th>
                {members.map((target) => (
                  <th key={target.userId} className="px-1 pb-2 align-bottom">
                    <div className="flex w-[68px] flex-col items-center gap-1">
                      <Avatar name={target.name} src={target.avatarUrl} size="sm" />
                      <span className="w-full truncate text-center text-[11px] font-medium text-muted">
                        {(target.name ?? target.email).split(" ")[0]}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((viewer) => {
                const isManager = viewer.role !== "agent";
                return (
                  <tr key={viewer.userId} className="group">
                    <th className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-normal">
                      <div className="flex min-w-[150px] items-center gap-2">
                        <Avatar name={viewer.name} src={viewer.avatarUrl} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-strong">
                            {viewer.name ?? viewer.email}
                          </span>
                          {isManager && (
                            <Badge tone="info" size="xs" className="mt-0.5">
                              sees everyone
                            </Badge>
                          )}
                        </span>
                      </div>
                    </th>

                    {members.map((target) => {
                      const self = viewer.userId === target.userId;
                      const key = `${viewer.userId}:${target.userId}`;
                      const granted = state[viewer.userId]?.includes(target.userId) ?? false;

                      if (self) {
                        return (
                          <td key={target.userId} className="px-1 py-1.5">
                            <Hint label="Everyone sees their own leads.">
                              <div className="mx-auto grid size-8 place-items-center rounded-lg bg-inset text-subtle">
                                <Eye className="size-3.5" />
                              </div>
                            </Hint>
                          </td>
                        );
                      }

                      if (isManager) {
                        return (
                          <td key={target.userId} className="px-1 py-1.5">
                            <Hint
                              label={`${viewer.name ?? viewer.email} is ${
                                viewer.role === "owner" ? "an owner" : "a team lead"
                              } and already sees every lead in the team.`}
                            >
                              <div className="mx-auto grid size-8 place-items-center rounded-lg text-info">
                                <Shield className="size-3.5" />
                              </div>
                            </Hint>
                          </td>
                        );
                      }

                      return (
                        <td key={target.userId} className="px-1 py-1.5">
                          <button
                            type="button"
                            onClick={() => void toggle(viewer, target)}
                            disabled={busy === key}
                            aria-pressed={granted}
                            aria-label={`${viewer.name ?? viewer.email} sees ${target.name ?? target.email}'s leads`}
                            className={cn(
                              "mx-auto grid size-8 place-items-center rounded-lg border transition-all",
                              "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
                              granted
                                ? "border-accent bg-accent text-accent-fg shadow-xs"
                                : "border-line bg-surface text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent",
                              busy === key && "opacity-50",
                            )}
                          >
                            <Check className="size-3.5" strokeWidth={3} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
