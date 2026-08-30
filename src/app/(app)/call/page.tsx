import type { Metadata } from "next";
import { requireCapability } from "@/lib/auth/session";
import { buildCallQueue, type QueueReason } from "@/lib/queries/call-queue";
import { getTodayProgress } from "@/lib/queries/dashboard";
import { CallMode } from "./call-mode";

export const metadata: Metadata = { title: "Call Mode" };
export const dynamic = "force-dynamic";

export default async function CallPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; lead?: string }>;
}) {
  const ctx = await requireCapability("calls.log");
  const params = await searchParams;

  const only = (["overdue", "due_today", "trial", "hot", "new"] as QueueReason[]).includes(
    params.view as QueueReason,
  )
    ? (params.view as QueueReason)
    : undefined;

  const [queue, progress] = await Promise.all([
    buildCallQueue(ctx.user.id, ctx.team.id, {
      window: [ctx.org.callingWindowStart, ctx.org.callingWindowEnd],
      only,
      leadId: params.lead,
    }),
    getTodayProgress(ctx.user.id),
  ]);

  return (
    <CallMode
      queue={queue}
      tz={ctx.user.timezone}
      callingWindow={[ctx.org.callingWindowStart, ctx.org.callingWindowEnd]}
      targets={{ dials: ctx.dailyDialTarget, connects: ctx.dailyConnectTarget }}
      startedWith={{ dials: progress.dials, answered: progress.answered, interested: progress.interested }}
    />
  );
}
