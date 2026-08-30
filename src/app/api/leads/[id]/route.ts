import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getLeadDetail, getLeadTimeline, recentContactByOthers } from "@/lib/queries/leads";
import { resolveCustomFields } from "@/lib/queries/custom-fields";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Drawer payload. Visibility is enforced inside `getLeadDetail`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;

  const lead = await getLeadDetail(ctx.user.id, id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [timeline, duplicate, customFields] = await Promise.all([
    getLeadTimeline(id),
    recentContactByOthers(lead.orgId, lead.phonePrimary, id),
    /* Values live on the lead as a bare `{key: value}` blob; the labels live
       in the org's field definitions. Joining them here means the drawer gets
       something it can render directly. */
    resolveCustomFields(lead.orgId, lead.customFields),
  ]);

  return NextResponse.json({
    lead: { ...lead, custom: customFields },
    timeline,
    duplicate: duplicate ? { userName: duplicate.userName, at: duplicate.at } : null,
  });
}
