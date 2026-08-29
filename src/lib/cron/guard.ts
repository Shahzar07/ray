import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Every cron route is behind this. Vercel Cron sends the secret as a bearer
 * token; anything else is refused, including — deliberately — every request
 * when CRON_SECRET is unset, so a misconfigured deploy fails closed rather
 * than exposing a mutating endpoint to the internet.
 */
export function assertCronRequest(request: Request): Response | null {
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set — refusing to run.");
    return Response.json({ ok: false, error: "Cron is not configured." }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;

  if (!provided || !equal(provided, secret)) {
    return Response.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  return null;
}

/** Constant-time compare so the endpoint does not leak the secret by timing. */
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Uniform shape for every job route, so failures are visible in the logs. */
export async function runJob(
  name: string,
  job: () => Promise<Record<string, number | string>>,
): Promise<Response> {
  const started = Date.now();
  try {
    const result = await job();
    const body = { ok: true, job: name, ms: Date.now() - started, ...result };
    console.log(`[cron:${name}]`, JSON.stringify(body));
    return Response.json(body);
  } catch (error) {
    console.error(`[cron:${name}]`, error);
    return Response.json(
      { ok: false, job: name, ms: Date.now() - started, error: "Job failed — see logs." },
      { status: 500 },
    );
  }
}
