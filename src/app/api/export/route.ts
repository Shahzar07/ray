import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/roles";
import { listLeads, type LeadFilters, type PresetKey } from "@/lib/queries/leads";
import { LEAD_STATUS } from "@/lib/domain/constants";
import type { InterestLevel, LeadStatus, TrialStatus } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = [
  "Name","Company","Job title","Phone","Email","City","Status","Interest","Score",
  "Attempts","Connects","Last attempt","Next follow-up","Trial status","Trial ends",
  "Owner","Tags","Source batch","Created",
];

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV of exactly the view the user is looking at — same filters, same rows. */
export async function GET(request: Request) {
  const ctx = await requireSession();
  /* A viewer sees the pipeline on screen; handing them a CSV of every lead is
     a different act, so it is a separate capability. */
  if (!can(ctx.role, "leads.export")) {
    return new Response("You do not have permission to export leads.", { status: 403 });
  }
  const params = new URL(request.url).searchParams;

  const filters: LeadFilters = {
    search: params.get("q") ?? undefined,
    status: (params.getAll("status") as LeadStatus[]).length ? (params.getAll("status") as LeadStatus[]) : undefined,
    interest: (params.getAll("interest") as InterestLevel[]).length
      ? (params.getAll("interest") as InterestLevel[])
      : undefined,
    assignee: params.getAll("assignee").length ? params.getAll("assignee") : undefined,
    trialStatus: (params.getAll("trial") as TrialStatus[]).length
      ? (params.getAll("trial") as TrialStatus[])
      : undefined,
    tags: params.getAll("tag").length ? params.getAll("tag") : undefined,
    preset: (params.get("view") as PresetKey) ?? undefined,
  };

  const { rows } = await listLeads(ctx.user.id, ctx.team.id, filters, { limit: 20000 });

  const csv = [
    HEADERS.join(","),
    ...rows.map((lead) =>
      [
        lead.fullName,
        lead.company,
        lead.jobTitle,
        lead.phonePrimary,
        lead.email,
        lead.city,
        LEAD_STATUS[lead.status].label,
        lead.interestLevel,
        lead.score,
        lead.attemptsCount,
        lead.connectsCount,
        lead.lastAttemptedAt,
        lead.nextFollowUpAt,
        lead.trialStatus,
        lead.trialEndsAt,
        lead.assigneeName,
        lead.tags.join(" "),
        lead.batchName,
        lead.createdAt,
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\n");

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="raynaters-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
