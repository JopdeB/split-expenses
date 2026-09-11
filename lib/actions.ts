"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

import { db, tables, pool } from "@/lib/db";
import { getSession } from "@/lib/session";

function parseDecimal(raw: FormDataEntryValue | null): number {
  if (!raw) return 0;
  const s = String(raw).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseIntOrNull(raw: FormDataEntryValue | null): number | null {
  if (!raw) return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function valueOrNull(raw: FormDataEntryValue | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

type TransactionInsert = typeof tables.transactions.$inferInsert;

function payloadFromForm(formData: FormData): TransactionInsert | { error: string } {
  const locationId = parseIntOrNull(formData.get("location_id"));
  const datum = valueOrNull(formData.get("datum"));
  if (locationId === null) return { error: "Locatie is verplicht" };
  if (!datum) return { error: "Datum is verplicht" };
  return {
    locationId,
    boekstuk: parseIntOrNull(formData.get("boekstuk")),
    datum,
    bedragInkomsten: parseDecimal(formData.get("bedrag_inkomsten")).toFixed(2),
    btwInkomsten: parseDecimal(formData.get("btw_inkomsten")).toFixed(2),
    bedragUitgaven: parseDecimal(formData.get("bedrag_uitgaven")).toFixed(2),
    btwUitgaven: parseDecimal(formData.get("btw_uitgaven")).toFixed(2),
    bedragDeeluitgaven: parseDecimal(formData.get("bedrag_deeluitgaven")).toFixed(2),
    btwDeeluitgaven: parseDecimal(formData.get("btw_deeluitgaven")).toFixed(2),
    btwCodeId: parseIntOrNull(formData.get("btw_code_id")),
    ledgerAccountId: parseIntOrNull(formData.get("ledger_account_id")),
    omschrijving: valueOrNull(formData.get("omschrijving")),
  };
}

function revalidateAll() {
  revalidatePath("/protected/transacties");
  revalidatePath("/protected/grootboek");
  revalidatePath("/protected/btw");
  revalidatePath("/protected/grafieken");
  revalidatePath("/protected/audit");
  revalidatePath("/protected");
}

/**
 * Run `fn` inside a transaction with the current user's id + email pinned
 * on the connection via SET LOCAL. The audit trigger reads these to fill
 * user_id / user_email in the audit_log. Uses a raw pg client so SET LOCAL
 * really applies to every query in the block (Drizzle's transaction() gives
 * one, but SET LOCAL must run on that specific connection first).
 */
async function withAuthCtx<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const session = await getSession();
  if (!session.userId) throw new Error("Not authenticated");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // set_config is safer with parameters than SET LOCAL (proper quoting).
    await client.query("select set_config('app.user_id', $1, true)", [session.userId]);
    await client.query("select set_config('app.user_email', $1, true)", [session.email ?? ""]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function createTransaction(formData: FormData) {
  const payload = payloadFromForm(formData);
  if ("error" in payload) throw new Error(payload.error);

  // Auto-assign boekstuk when the user left it blank: next number for this
  // location + year, starting at 1. Race-tolerant: in the worst case two
  // simultaneous inserts get the same number, which the boekhouder spots in
  // the list view. Single-tenant family app, low concurrency.
  if (payload.boekstuk == null) {
    payload.boekstuk = await nextBoekstuk(payload.locationId, payload.datum);
  }

  await withAuthCtx(async (client) => {
    const cols = Object.keys(payload) as Array<keyof TransactionInsert>;
    const dbCols: Record<keyof TransactionInsert, string> = {
      locationId: "location_id",
      boekstuk: "boekstuk",
      datum: "datum",
      bedragInkomsten: "bedrag_inkomsten",
      btwInkomsten: "btw_inkomsten",
      bedragUitgaven: "bedrag_uitgaven",
      btwUitgaven: "btw_uitgaven",
      bedragDeeluitgaven: "bedrag_deeluitgaven",
      btwDeeluitgaven: "btw_deeluitgaven",
      btwCodeId: "btw_code_id",
      ledgerAccountId: "ledger_account_id",
      omschrijving: "omschrijving",
      id: "id",
      createdAt: "created_at",
      updatedAt: "updated_at",
      createdBy: "created_by",
    };
    const insertCols = cols.filter((c) => payload[c] !== undefined).map((c) => dbCols[c]);
    const insertVals = cols.filter((c) => payload[c] !== undefined).map((c) => payload[c]);
    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(", ");
    await client.query(
      `insert into public.transactions (${insertCols.join(", ")}) values (${placeholders})`,
      insertVals,
    );
  });

  revalidateAll();
  redirect("/protected/transacties");
}

export async function updateTransaction(id: number, formData: FormData) {
  const payload = payloadFromForm(formData);
  if ("error" in payload) throw new Error(payload.error);

  await withAuthCtx(async (client) => {
    const updateableCols: Array<[keyof TransactionInsert, string]> = [
      ["locationId", "location_id"],
      ["boekstuk", "boekstuk"],
      ["datum", "datum"],
      ["bedragInkomsten", "bedrag_inkomsten"],
      ["btwInkomsten", "btw_inkomsten"],
      ["bedragUitgaven", "bedrag_uitgaven"],
      ["btwUitgaven", "btw_uitgaven"],
      ["bedragDeeluitgaven", "bedrag_deeluitgaven"],
      ["btwDeeluitgaven", "btw_deeluitgaven"],
      ["btwCodeId", "btw_code_id"],
      ["ledgerAccountId", "ledger_account_id"],
      ["omschrijving", "omschrijving"],
    ];
    const setParts: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of updateableCols) {
      if (payload[key] === undefined) continue;
      values.push(payload[key]);
      setParts.push(`${col} = $${values.length}`);
    }
    values.push(id);
    await client.query(
      `update public.transactions set ${setParts.join(", ")} where id = $${values.length}`,
      values,
    );
  });

  revalidateAll();
  redirect("/protected/transacties");
}

export async function deleteTransaction(id: number) {
  await withAuthCtx(async (client) => {
    await client.query(`delete from public.transactions where id = $1`, [id]);
  });
  revalidateAll();
  // Delete is now triggered from the edit page — staying there would 404 on
  // the just-removed id, so bounce back to the list.
  redirect("/protected/transacties");
}

/**
 * Next boekstuk for a given location + year. Returns max(boekstuk)+1, or 1
 * if the location has no boekingen for that year yet.
 */
export async function nextBoekstuk(locationId: number, datum: string): Promise<number> {
  const year = parseInt(datum.slice(0, 4), 10);
  if (!Number.isFinite(year)) return 1;
  const rows = await db
    .select({ boekstuk: tables.transactions.boekstuk })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.locationId, locationId),
        gte(tables.transactions.datum, `${year}-01-01`),
        lte(tables.transactions.datum, `${year}-12-31`),
        isNotNull(tables.transactions.boekstuk),
      ),
    )
    .orderBy(desc(tables.transactions.boekstuk))
    .limit(1);
  const max = rows[0]?.boekstuk;
  return typeof max === "number" ? max + 1 : 1;
}
