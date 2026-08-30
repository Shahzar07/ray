import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { Pool } from "pg";
import { poolConfig } from "../src/lib/db/ssl";

/**
 * DDL wants a direct connection. On Supabase, DATABASE_URL is the transaction
 * pooler (port 6543), which is right for the app and wrong for migrations —
 * so DIRECT_URL (port 5432) wins here when it is set. Everywhere else the two
 * are the same string and this is a no-op.
 */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

/**
 * Runs as part of `vercel-build`, so a missing URL is a skip rather than a
 * failure: a build with no database configured is a legitimate thing to do
 * (previews, CI, a first deploy before the env vars are in). A real migration
 * failure below still exits non-zero and stops the deploy.
 */
if (!url) {
  console.log("• no DATABASE_URL — skipping migrations");
  process.exit(0);
}

async function main() {
  const folder = "./drizzle";
  if (/neon\.(tech|build)/.test(url!)) {
    await migrateNeon(drizzleNeon(neon(url!)), { migrationsFolder: folder });
  } else {
    const pool = new Pool(poolConfig(url!));
    await migrate(drizzle(pool), { migrationsFolder: folder });
    await pool.end();
  }
  console.log("✔ migrations applied");
}

main().catch((error) => {
  console.error("✘ migration failed:", error);
  process.exit(1);
});
