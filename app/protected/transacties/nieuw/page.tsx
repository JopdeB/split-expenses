import { createClient } from "@/lib/supabase/server";
import { TransactieForm } from "@/components/transactie-form";
import { createTransaction } from "@/lib/actions";
import type { BtwCode, LedgerAccount, Location } from "@/lib/types";
import { fetchNextBoekstukMap } from "@/lib/next-boekstuk";

export default async function NieuweTransactiePage() {
  const supabase = await createClient();

  const [{ data: locations }, { data: ledgerAccounts }, { data: btwCodes }, nextBoekstukMap] =
    await Promise.all([
      supabase.from("locations").select("*").order("sort_order"),
      supabase.from("ledger_accounts").select("*").order("sort_order"),
      supabase.from("btw_codes").select("*").order("sort_order"),
      fetchNextBoekstukMap(supabase),
    ]);

  return (
    <>
      <h1 className="text-2xl font-bold">Nieuwe transactie</h1>
      <TransactieForm
        action={createTransaction}
        locations={(locations as Location[]) ?? []}
        ledgerAccounts={(ledgerAccounts as LedgerAccount[]) ?? []}
        btwCodes={(btwCodes as BtwCode[]) ?? []}
        nextBoekstukMap={nextBoekstukMap}
        submitLabel="Opslaan"
      />
    </>
  );
}
