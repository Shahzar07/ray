import { postgresConfig } from "./connection";
/** Preserve verified TLS and honor a supplied provider CA in every connection. */
export function poolConfig(connectionString: string) {
  return postgresConfig(connectionString, process.env.DATABASE_CA_CERT);
}
