import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Two drivers, one schema:
 *  - Neon over HTTP when DATABASE_URL points at Neon — no pool to warm on a
 *    cold start.
 *  - node-postgres everywhere else: Supabase, local Postgres, and every script
 *    (migrate, seed, cron, tests).
 *
 * Both build identical queries, so the rest of the app is typed against one
 * shape and never learns which driver is live.
 *
 * On Supabase, use the **transaction pooler** (port 6543) for the app. Drizzle
 * only issues named prepared statements when you call `.prepare()`, which this
 * codebase never does, so everything here is compatible with transaction-mode
 * pooling. Migrations are the exception — they need the direct connection
 * (port 5432), which is why `pnpm db:migrate` reads DIRECT_URL when it is set.
 */
const isNeon = /neon\.(tech|build)/.test(env.DATABASE_URL);

export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __calldeskDb?: Database; __calldeskPool?: Pool };

function createDb(): Database {
  if (isNeon) {
    return drizzleNeon(neon(env.DATABASE_URL), { schema }) as unknown as Database;
  }
  const pool =
    globalForDb.__calldeskPool ??
    new Pool({
      connectionString: env.DATABASE_URL,
      /* Supabase's free tier has a modest connection ceiling and every
         serverless instance opens its own pool, so keep each one small and
         let idle connections go. */
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  globalForDb.__calldeskPool = pool;
  return drizzlePg(pool, { schema });
}

export const db: Database = globalForDb.__calldeskDb ?? createDb();
if (env.NODE_ENV !== "production") globalForDb.__calldeskDb = db;

export { schema };
