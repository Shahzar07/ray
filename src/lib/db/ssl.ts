import type { PoolConfig } from "pg";

/**
 * Builds the `pg` pool config for a connection URL, with TLS resolved
 * explicitly rather than left to the driver.
 *
 * This exists because of a genuinely surprising precedence rule in
 * node-postgres. `ConnectionParameters` does:
 *
 *     config = Object.assign({}, config, parse(config.connectionString))
 *
 * — the parsed connection string is merged *over* the options you passed, so
 * an `sslmode=` in the URL silently discards any `ssl` object given in code.
 * That is what broke the first Supabase deploy: `sslmode=require` parsed to an
 * empty `ssl: {}`, Node then verified the chain against its own trust store,
 * and Supabase's pooler — which presents a self-signed chain — failed every
 * query with SELF_SIGNED_CERT_IN_CHAIN. The only visible symptom was a 500 on
 * /login, because that is the first page that touches the database.
 *
 * Stripping `sslmode` is not sufficient on its own either: with no `sslmode`
 * and no explicit option the parser yields `ssl: false`, meaning no TLS at
 * all, which the pooler refuses. Both halves are required, which is why this
 * returns the rewritten URL and the `ssl` value together and callers must use
 * both.
 */
export function poolConfig(connectionString: string): PoolConfig {
  const mode = sslModeOf(connectionString);

  /* No sslmode, or an explicit disable: plaintext. This is the local-Postgres
     and CI path, and it stays byte-for-byte what it was before. */
  if (mode === null || mode === "disable") {
    return { connectionString, ssl: false };
  }

  return { connectionString: stripSslParams(connectionString), ssl: sslOptions(mode) };
}

function sslOptions(mode: string): PoolConfig["ssl"] {
  /* The upgrade path. Supply the provider's root certificate and the chain is
     verified properly — identity as well as encryption. Supabase publishes
     one under Project settings → Database → SSL configuration. */
  const ca = process.env.DATABASE_CA_CERT?.trim();
  if (ca) return { ca, rejectUnauthorized: true };

  /* Asking for verify-* without supplying a CA is taken at face value: the
     caller has said they want the chain checked, so let it fail loudly rather
     than quietly downgrading what they asked for. */
  if (mode === "verify-ca" || mode === "verify-full") return { rejectUnauthorized: true };

  /* The default for `require`/`prefer`. The connection is encrypted; the
     server's certificate chain is not checked, because Supabase's pooler
     signs its own and Node has no way to know it. This is the same trade-off
     libpq makes for `sslmode=require`, and the reason the SQL standard treats
     `require` and `verify-full` as different modes at all. Set
     DATABASE_CA_CERT to close the gap. */
  return { rejectUnauthorized: false };
}

function sslModeOf(url: string): string | null {
  return url.match(/[?&]sslmode=([^&]*)/i)?.[1]?.toLowerCase() ?? null;
}

/**
 * Removes the SSL query parameters so the driver cannot re-derive an `ssl`
 * value from them and overwrite ours.
 *
 * Deliberately a string edit rather than a `new URL()` round trip: these URLs
 * carry percent-encoded passwords (`123%40x%40456`), and re-serialising a URL
 * is an easy way to corrupt one.
 */
function stripSslParams(url: string): string {
  return url
    .replace(/[?&](sslmode|uselibpqcompat)=[^&]*/gi, (match) => (match[0] === "?" ? "?" : ""))
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");
}
