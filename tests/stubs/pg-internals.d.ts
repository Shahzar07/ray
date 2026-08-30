/**
 * `pg` ships types for its internals but does not expose them through the
 * package's "exports" map, so the deep import in db-ssl.test.ts resolves to
 * `any` — which this codebase does not allow anywhere.
 *
 * The test reaches into this module deliberately: it asserts on the TLS
 * settings the driver *actually* resolves after merging the connection string
 * over our options, not on what we hand it. Only the one field it reads is
 * declared here.
 */
declare module "pg/lib/connection-parameters.js" {
  import type { PoolConfig } from "pg";

  export default class ConnectionParameters {
    constructor(config: PoolConfig);
    ssl: boolean | { rejectUnauthorized?: boolean; ca?: string };
  }
}
