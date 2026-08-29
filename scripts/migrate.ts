import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");

async function main() {
  const folder = "./drizzle";
  if (/neon\.(tech|build)/.test(url!)) {
    await migrateNeon(drizzleNeon(neon(url!)), { migrationsFolder: folder });
  } else {
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: folder });
    await pool.end();
  }
  console.log("✔ migrations applied");
}

main().catch((error) => {
  console.error("✘ migration failed:", error);
  process.exit(1);
});
