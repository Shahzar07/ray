import { assertCronRequest, runJob } from "@/lib/cron/guard";
import { runWeeklyRollup } from "@/lib/cron/nightly";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Weekly: the manager rollup, and a database-size check against the free tier. */
export async function GET(request: Request) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  return runJob("weekly", () => runWeeklyRollup());
}
