import { assertCronRequest, runJob } from "@/lib/cron/guard";
import { runOverdueNotifications } from "@/lib/cron/trials";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every half hour: tell callers which follow-ups have gone past their date. */
export async function GET(request: Request) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  return runJob("follow-ups", () => runOverdueNotifications());
}
