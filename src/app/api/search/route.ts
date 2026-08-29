import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { listLeads } from "@/lib/queries/leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Backs the ⌘K palette. Same visibility rules as every other lead read. */
export async function GET(request: Request) {
  const ctx = await requireSession();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ leads: [] });

  const { rows } = await listLeads(ctx.user.id, ctx.team.id, { search: query }, { limit: 8 });

  return NextResponse.json({
    leads: rows.map((lead) => ({
      id: lead.id,
      fullName: lead.fullName,
      company: lead.company,
      phonePrimary: lead.phonePrimary,
      status: lead.status,
    })),
  });
}
