import { describe, expect, it, afterEach } from "vitest";
import ConnectionParameters from "pg/lib/connection-parameters.js";
import { poolConfig } from "@/lib/db/ssl";

/**
 * The bug this pins took production down: every page that touched the database
 * returned a 500 with SELF_SIGNED_CERT_IN_CHAIN, because `sslmode=require` in
 * the URL silently overrode the `ssl` option passed in code.
 *
 * So these assertions deliberately go through `pg`'s own ConnectionParameters
 * rather than just checking what `poolConfig` returns. What matters is not the
 * object we hand the driver — it is the TLS setting the driver actually ends
 * up using after it has merged the connection string over our options.
 */
const SUPABASE =
  "postgresql://postgres.ldplldsqjnkyjnbfboiw:pa%40ss%40word@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require";

/** What `pg` will really do, which is the only thing that counts. */
function resolvedSsl(url: string) {
  return new ConnectionParameters(poolConfig(url)).ssl;
}

afterEach(() => {
  delete process.env.DATABASE_CA_CERT;
});

describe("poolConfig", () => {
  it("encrypts without demanding a chain pg cannot verify", () => {
    // The regression itself: this used to resolve to `{}`, i.e. verify against
    // Node's trust store, which Supabase's self-signed pooler chain fails.
    expect(resolvedSsl(SUPABASE)).toEqual({ rejectUnauthorized: false });
  });

  it("does not silently fall back to an unencrypted connection", () => {
    // The opposite failure: strip sslmode and pass nothing and pg yields
    // `ssl: false`, which the pooler refuses outright.
    expect(resolvedSsl(SUPABASE)).not.toBe(false);
  });

  it("leaves a percent-encoded password untouched", () => {
    // Rebuilding the URL through `new URL()` is an easy way to corrupt this.
    expect(poolConfig(SUPABASE).connectionString).toContain("pa%40ss%40word");
  });

  it("verifies properly when a CA is supplied", () => {
    process.env.DATABASE_CA_CERT = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----";
    expect(resolvedSsl(SUPABASE)).toMatchObject({ rejectUnauthorized: true });
  });

  it("honours an explicit request for a verified chain", () => {
    // Asking for verify-full and getting rejectUnauthorized:false would be the
    // library quietly weakening what the operator asked for.
    expect(resolvedSsl("postgres://u:p@h:5432/db?sslmode=verify-full")).toEqual({
      rejectUnauthorized: true,
    });
  });

  it("leaves local development on plaintext, exactly as before", () => {
    expect(resolvedSsl("postgresql://ray@localhost:5433/calldesk")).toBe(false);
    expect(resolvedSsl("postgres://u:p@h:5432/db?sslmode=disable")).toBe(false);
  });

  it("strips sslmode wherever it sits in the query string", () => {
    const first = poolConfig("postgres://u:p@h:5432/db?sslmode=require&application_name=x");
    const last = poolConfig("postgres://u:p@h:5432/db?application_name=x&sslmode=require");
    expect(first.connectionString).toBe("postgres://u:p@h:5432/db?application_name=x");
    expect(last.connectionString).toBe("postgres://u:p@h:5432/db?application_name=x");
  });
});
