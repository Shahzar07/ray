import { assertCronRequest, runJob } from "@/lib/cron/guard";
import { runTrialTransitions } from "@/lib/cron/trials";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Hourly: demo-week state transitions, the 1/4/6/7 cadence, ending alerts. */
export async function GET(request: Request) {
  const denied = assertCronRequest(request);
  if (denied) return denied;
  return runJob("trials", () => runTrialTransitions());
}
