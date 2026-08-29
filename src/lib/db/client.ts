import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Two drivers, one schema:
 *  - Neon over HTTP in production (Vercel) — no pool to warm on a cold start.
 *  - node-postgres for local Postgres and for scripts (migrate, seed, cron, tests).
 *
 * Both build identical queries, so the rest of the app is typed against one
 * shape and never learns which driver is live.
 */
const isNeon = /neon\.(tech|build)/.test(env.DATABASE_URL);

export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __calldeskDb?: Database; __calldeskPool?: Pool };

function createDb(): Database {
  if (isNeon) {
    return drizzleNeon(neon(env.DATABASE_URL), { schema }) as unknown as Database;
  }
  const pool = globalForDb.__calldeskPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 5 });
  globalForDb.__calldeskPool = pool;
  return drizzlePg(pool, { schema });
}

export const db: Database = globalForDb.__calldeskDb ?? createDb();
if (env.NODE_ENV !== "production") globalForDb.__calldeskDb = db;

export { schema };
