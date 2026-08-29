import { assertCronRequest, runJob } from "@/lib/cron/guard";
import { runNightly } from "@/lib/cron/nightly";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Nightly: daily_stats rollup, lead rescoring, give-up rule, manager brief. */
export async function GET(request: Request) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  return runJob("nightly", () => runNightly());
}
