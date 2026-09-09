"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";

import { db, tables } from "@/lib/db";

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

// Drizzle takes NUMERIC columns as strings so precision isn't lost in JS.
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

  await db.insert(tables.transactions).values(payload);
  revalidateAll();
  redirect("/protected/transacties");
}

export async function updateTransaction(id: number, formData: FormData) {
  const payload = payloadFromForm(formData);
  if ("error" in payload) throw new Error(payload.error);

  await db.update(tables.transactions).set(payload).where(eq(tables.transactions.id, id));
  revalidateAll();
  redirect("/protected/transacties");
}

export async function deleteTransaction(id: number) {
  await db.delete(tables.transactions).where(eq(tables.transactions.id, id));
  revalidateAll();
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
