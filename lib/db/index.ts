import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Single shared Pool for the process. In Next.js dev the module is re-imported
// on HMR; stash the pool on globalThis to avoid opening dozens of connections.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function makePool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Do NOT throw at module load: Next's build-time page-data collector
    // imports this file in an environment without runtime env vars, and a
    // throw here breaks the whole build. Return a Pool that will fail lazily
    // when a query actually runs — that's the only place the missing env
    // matters.
    return new Pool({
      connectionString: "postgresql://invalid@127.0.0.1:1/invalid",
      max: 1,
      // Prevent the invalid pool from consuming a socket at boot.
      idleTimeoutMillis: 1,
      connectionTimeoutMillis: 1,
    });
  }
  return new Pool({
    connectionString: url,
    // Keep the pool small — this app has 2 users, not 200.
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

const pool = globalThis.__pgPool ?? (globalThis.__pgPool = makePool());

export { pool };
export const db = drizzle(pool, { schema });
export type Db = typeof db;
export * as tables from "./schema";
