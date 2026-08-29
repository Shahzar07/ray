import type { Metadata } from "next";
import { requireSession, teamMembers } from "@/lib/auth/session";
import { distinctTags, listLeads, type LeadFilters, type PresetKey } from "@/lib/queries/leads";
import { visibleUserIds } from "@/lib/auth/visibility";
import { LeadsClient } from "./leads-client";
import type { InterestLevel, LeadStatus, TrialStatus } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function many(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireSession();
  const params = await searchParams;

  const filters: LeadFilters = {
    search: typeof params.q === "string" ? params.q : undefined,
    status: many(params.status) as LeadStatus[] | undefined,
    interest: many(params.interest) as InterestLevel[] | undefined,
    assignee: many(params.assignee),
    trialStatus: many(params.trial) as TrialStatus[] | undefined,
    tags: many(params.tag),
    preset: typeof params.view === "string" ? (params.view as PresetKey) : undefined,
    batchId: typeof params.batch === "string" ? params.batch : undefined,
  };

  const [{ rows, total }, allMembers, tags, allowed] = await Promise.all([
    listLeads(ctx.user.id, ctx.team.id, filters, {
      sort: typeof params.sort === "string" ? params.sort : undefined,
      dir: params.dir === "asc" ? "asc" : "desc",
      limit: 2000,
    }),
    teamMembers(ctx.team.id),
    distinctTags(ctx.team.id),
    visibleUserIds(ctx.user.id, ctx.team.id),
  ]);

  // The assignee filter and the reassign menu only ever list people this
  // user is allowed to see leads for.
  const members = allMembers
    .filter((m) => allowed.includes(m.id))
    .map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl }));

  return (
    <LeadsClient
      rows={rows}
      total={total}
      members={members}
      tags={tags}
      tz={ctx.user.timezone}
      role={ctx.role}
      openLeadId={typeof params.lead === "string" ? params.lead : null}
    />
  );
}
