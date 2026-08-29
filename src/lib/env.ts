import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  AUTH_URL: z.string().url().optional(),
  CRON_SECRET: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  DEFAULT_COUNTRY: z.string().length(2).default("PK"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success && process.env.SKIP_ENV_VALIDATION !== "1") {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = (parsed.success
  ? parsed.data
  : ({
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "dev-secret-dev-secret",
      GROQ_MODEL: "llama-3.3-70b-versatile",
      DEFAULT_COUNTRY: "PK",
      NODE_ENV: "development",
    } as z.infer<typeof schema>)) satisfies z.infer<typeof schema>;

/** AI features are strictly optional — the app is fully usable without a key. */
export const aiEnabled = Boolean(env.GROQ_API_KEY);
