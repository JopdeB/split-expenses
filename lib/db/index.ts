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
    throw new Error(
      "DATABASE_URL is not set. Set it in .env.local (see .env.example).",
    );
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
