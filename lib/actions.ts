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
    btw_code_id: parseIntOrNull(formData.get("btw_code_id")),
    ledger_account_id: parseIntOrNull(formData.get("ledger_account_id")),
    omschrijving: valueOrNull(formData.get("omschrijving")),
  };
}

export async function createTransaction(formData: FormData) {
  const result = payloadFromForm(formData);
  if ("error" in result) throw new Error(result.error);

  const supabase = await createClient();
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

export async function deleteTransaction(id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/protected/transacties");
  revalidatePath("/protected/grootboek");
  revalidatePath("/protected/btw");
  revalidatePath("/protected");
}
