import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db, tables } from "@/lib/db";
import { TransactieForm } from "@/components/transactie-form";
import { updateTransaction } from "@/lib/actions";
import { fetchNextBoekstukMap } from "@/lib/next-boekstuk";

export default async function EditTransactiePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const txId = parseInt(id, 10);
  if (!Number.isFinite(txId)) notFound();

  const [txRows, locations, ledgerAccounts, btwCodes, nextBoekstukMap] = await Promise.all([
    db.select().from(tables.transactions).where(eq(tables.transactions.id, txId)).limit(1),
    db.select().from(tables.locations).orderBy(asc(tables.locations.sortOrder)),
    db.select().from(tables.ledgerAccounts).orderBy(asc(tables.ledgerAccounts.sortOrder)),
    db.select().from(tables.btwCodes).orderBy(asc(tables.btwCodes.sortOrder)),
    fetchNextBoekstukMap(),
  ]);

  const tx = txRows[0];
  if (!tx) notFound();

  const updateWithId = updateTransaction.bind(null, txId);

  return (
    <>
      <h1 className="text-2xl font-bold">Transactie bewerken</h1>
      <TransactieForm
        action={updateWithId}
        locations={locations}
        ledgerAccounts={ledgerAccounts}
        btwCodes={btwCodes}
        nextBoekstukMap={nextBoekstukMap}
        initial={tx}
        submitLabel="Bijwerken"
      />
    </>
  );
}
