import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  /* drizzle-kit runs DDL, so it wants the direct connection too. */
  dbCredentials: { url: (process.env.DIRECT_URL || process.env.DATABASE_URL)! },
  strict: true,
  verbose: true,
});
