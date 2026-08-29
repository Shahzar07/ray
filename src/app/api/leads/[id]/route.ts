import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getLeadDetail, getLeadTimeline, recentContactByOthers } from "@/lib/queries/leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Drawer payload. Visibility is enforced inside `getLeadDetail`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;

  const lead = await getLeadDetail(ctx.user.id, id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [timeline, duplicate] = await Promise.all([
    getLeadTimeline(id),
    recentContactByOthers(lead.orgId, lead.phonePrimary, id),
  ]);

  return NextResponse.json({
    lead,
    timeline,
    duplicate: duplicate ? { userName: duplicate.userName, at: duplicate.at } : null,
  });
}
