import { asc } from "drizzle-orm";

import { db, tables } from "@/lib/db";
import { TransactieForm } from "@/components/transactie-form";
import { createTransaction } from "@/lib/actions";
import { fetchNextBoekstukMap } from "@/lib/next-boekstuk";

// Read from the live DB, never prerender at build time (build has no
// tunnel).
export const dynamic = "force-dynamic";

export default async function NieuweTransactiePage() {
  const [locations, ledgerAccounts, btwCodes, nextBoekstukMap] = await Promise.all([
    db.select().from(tables.locations).orderBy(asc(tables.locations.sortOrder)),
    db.select().from(tables.ledgerAccounts).orderBy(asc(tables.ledgerAccounts.sortOrder)),
    db.select().from(tables.btwCodes).orderBy(asc(tables.btwCodes.sortOrder)),
    fetchNextBoekstukMap(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-bold">Nieuwe transactie</h1>
      <TransactieForm
        action={createTransaction}
        locations={locations}
        ledgerAccounts={ledgerAccounts}
        btwCodes={btwCodes}
        nextBoekstukMap={nextBoekstukMap}
        submitLabel="Opslaan"
      />
    </>
  );
}
