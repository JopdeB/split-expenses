import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TransactieForm } from "@/components/transactie-form";
import { updateTransaction } from "@/lib/actions";
import type {
  BtwCode,
  LedgerAccount,
  Location,
  Transaction,
} from "@/lib/types";

export default async function EditTransactiePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const txId = parseInt(id, 10);
  if (!Number.isFinite(txId)) notFound();

  const supabase = await createClient();
  const [{ data: tx }, { data: locations }, { data: ledgerAccounts }, { data: btwCodes }] =
    await Promise.all([
      supabase.from("transactions").select("*").eq("id", txId).single(),
      supabase.from("locations").select("*").order("sort_order"),
      supabase.from("ledger_accounts").select("*").order("sort_order"),
      supabase.from("btw_codes").select("*").order("sort_order"),
    ]);

  if (!tx) notFound();

  const updateWithId = updateTransaction.bind(null, txId);

  return (
    <>
      <h1 className="text-2xl font-bold">Transactie bewerken</h1>
      <TransactieForm
        action={updateWithId}
        locations={(locations as Location[]) ?? []}
        ledgerAccounts={(ledgerAccounts as LedgerAccount[]) ?? []}
        btwCodes={(btwCodes as BtwCode[]) ?? []}
        initial={tx as Transaction}
        submitLabel="Bijwerken"
      />
    </>
  );
}
