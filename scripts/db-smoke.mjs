#!/usr/bin/env node
// Snelle rooktest: verifieer dat de tunnel werkt en de nieuwe DB
// dezelfde counts geeft als Supabase. Vereist dat scripts/db-tunnel.sh
// draait in een aparte terminal (of via een background job).
//
//   node scripts/db-smoke.mjs

import { Pool } from "pg";
import { readFileSync } from "node:fs";

// Snelle env-loader (avoids pulling in dotenv just for this).
try {
  const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const raw of envFile.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
} catch (e) {
  console.warn("(couldn't load .env.local:", e.message + ")");
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Set it in .env.local");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  console.log("Connecting to", process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@"));
  const client = await pool.connect();
  try {
    const server = await client.query("select version() as v");
    console.log("Server:", server.rows[0].v.split(" on ")[0]);

    const counts = await client.query(`
      select
        (select count(*) from public.locations)       as locations,
        (select count(*) from public.ledger_accounts) as ledger_accounts,
        (select count(*) from public.btw_codes)       as btw_codes,
        (select count(*) from public.transactions)    as transactions,
        (select count(*) from public.audit_log)       as audit_log,
        (select count(*) from public.users)           as users
    `);
    console.log("Row counts:", counts.rows[0]);

    const vt = await client.query(`
      select count(*) as n, min(datum) as oldest, max(datum) as newest
      from public.v_transactions
    `);
    console.log("v_transactions:", vt.rows[0]);

    const gb = await client.query(`
      select count(*) as n from public.v_grootboek
    `);
    console.log("v_grootboek rows:", gb.rows[0].n);

    const btw = await client.query(`
      select count(*) as n from public.v_btw_quarterly
    `);
    console.log("v_btw_quarterly rows:", btw.rows[0].n);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e.message);
  process.exit(1);
});
