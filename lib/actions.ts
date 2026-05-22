"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export type TransactionPayload = {
  location_id: number;
  boekstuk: number | null;
  datum: string;
  bedrag_inkomsten: number;
  btw_inkomsten: number;
  bedrag_uitgaven: number;
  btw_uitgaven: number;
  bedrag_deeluitgaven: number;
  btw_deeluitgaven: number;
  btw_code_id: number | null;
  ledger_account_id: number | null;
  omschrijving: string | null;
};

function payloadFromForm(formData: FormData): TransactionPayload | { error: string } {
  const location_id = parseIntOrNull(formData.get("location_id"));
  const datum = valueOrNull(formData.get("datum"));
  if (location_id === null) return { error: "Locatie is verplicht" };
  if (!datum) return { error: "Datum is verplicht" };
  return {
    location_id,
    boekstuk: parseIntOrNull(formData.get("boekstuk")),
    datum,
    bedrag_inkomsten: parseDecimal(formData.get("bedrag_inkomsten")),
    btw_inkomsten: parseDecimal(formData.get("btw_inkomsten")),
    bedrag_uitgaven: parseDecimal(formData.get("bedrag_uitgaven")),
    btw_uitgaven: parseDecimal(formData.get("btw_uitgaven")),
    bedrag_deeluitgaven: parseDecimal(formData.get("bedrag_deeluitgaven")),
    btw_deeluitgaven: parseDecimal(formData.get("btw_deeluitgaven")),
    btw_code_id: parseIntOrNull(formData.get("btw_code_id")),
    ledger_account_id: parseIntOrNull(formData.get("ledger_account_id")),
    omschrijving: valueOrNull(formData.get("omschrijving")),
  };
}

export async function createTransaction(formData: FormData) {
  const result = payloadFromForm(formData);
  if ("error" in result) throw new Error(result.error);

  const supabase = await createClient();

  // Auto-assign boekstuk when the user left it blank: next number for this
  // location + year, starting at 1. Race-tolerant: in the worst case two
  // simultaneous inserts get the same number, which the boekhouder spots in
  // the list view. Single-tenant family app, low concurrency.
  if (result.boekstuk === null) {
    result.boekstuk = await nextBoekstuk(supabase, result.location_id, result.datum);
  }

  const { error } = await supabase.from("transactions").insert(result);
  if (error) throw new Error(error.message);

  revalidatePath("/protected/transacties");
  revalidatePath("/protected/grootboek");
  revalidatePath("/protected/btw");
  revalidatePath("/protected");
  redirect("/protected/transacties");
}

export async function updateTransaction(id: number, formData: FormData) {
  const result = payloadFromForm(formData);
  if ("error" in result) throw new Error(result.error);

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").update(result).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/protected/transacties");
  revalidatePath("/protected/grootboek");
  revalidatePath("/protected/btw");
  revalidatePath("/protected");
  redirect("/protected/transacties");
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Next boekstuk for a given location + year. Returns max(boekstuk)+1, or 1
 * if the location has no boekingen for that year yet. Errors are swallowed
 * and produce 1 so the form never blocks on a transient DB issue.
 */
export async function nextBoekstuk(
  supabase: SupabaseClient,
  location_id: number,
  datum: string,
): Promise<number> {
  const year = parseInt(datum.slice(0, 4), 10);
  if (!Number.isFinite(year)) return 1;
  const { data } = await supabase
    .from("transactions")
    .select("boekstuk")
    .eq("location_id", location_id)
    .gte("datum", `${year}-01-01`)
    .lte("datum", `${year}-12-31`)
    .not("boekstuk", "is", null)
    .order("boekstuk", { ascending: false })
    .limit(1);
  const max = data?.[0]?.boekstuk;
  return typeof max === "number" ? max + 1 : 1;
}

export async function deleteTransaction(id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/protected/transacties");
  revalidatePath("/protected/grootboek");
  revalidatePath("/protected/btw");
  revalidatePath("/protected");
}
