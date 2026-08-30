import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  AUTH_URL: z.string().url().optional(),
  CRON_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  /**
   * Comma-separated fallback chain. OpenRouter tries them in order and serves
   * the first that answers, which matters because free models rate-limit hard
   * and independently — a single model id would make the AI features flaky.
   */
  OPENROUTER_MODELS: z
    .string()
    .default("nvidia/nemotron-3-super-120b-a12b:free,z-ai/glm-5.2:free,google/gemma-4-31b-it:free"),
  /** Sent to OpenRouter for attribution; harmless if unset. */
  OPENROUTER_SITE_URL: z.string().optional(),
  DEFAULT_COUNTRY: z.string().length(2).default("PK"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

/**
 * A build is not a run. `next build` imports every route module to collect page
 * data, which loads this file — so validating here used to make the build itself
 * demand DATABASE_URL and AUTH_SECRET. On Vercel that surfaced as the wonderfully
 * unhelpful "Failed to collect page data for /api/cron/follow-ups", with the real
 * cause buried above it.
 *
 * Builds are skipped; every runtime path still validates on cold start, so a
 * genuinely missing variable still fails loudly and early — just at the point
 * where it actually matters.
 */
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.SKIP_ENV_VALIDATION === "1";

if (!parsed.success && !isBuildPhase) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = (parsed.success
  ? parsed.data
  : ({
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "dev-secret-dev-secret",
      OPENROUTER_MODELS:
        "nvidia/nemotron-3-super-120b-a12b:free,z-ai/glm-5.2:free,google/gemma-4-31b-it:free",
      DEFAULT_COUNTRY: "PK",
      NODE_ENV: "development",
    } as z.infer<typeof schema>)) satisfies z.infer<typeof schema>;

/** AI features are strictly optional — the app is fully usable without a key. */
export const aiEnabled = Boolean(env.OPENROUTER_API_KEY);

/**
 * The fallback chain, parsed once. Capped at three because OpenRouter rejects
 * a longer `models` array with a 400 — without this cap, one over-long env
 * value would silently break every AI surface at once.
 */
export const aiModels: string[] = env.OPENROUTER_MODELS.split(",")
  .map((m) => m.trim())
  .filter(Boolean)
  .slice(0, 3);

