import type { PoolConfig } from "pg";

/** Keep certificate verification enabled, including for provider-specific CAs. */
export function postgresConfig(
  connectionString: string,
  ca?: string,
): PoolConfig {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  if (!ca?.trim())
    return { connectionString, max: 5, connectionTimeoutMillis: 10_000 };
  // pg's URL SSL options otherwise overwrite the explicit ssl object.
  for (const key of [
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "uselibpqcompat",
  ])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 10_000,
    ssl: { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true },
  };
}
