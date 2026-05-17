import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { formatDate, formatEuro } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TransactiesFilters } from "@/components/transacties-filters";
import { DeleteTransactionButton } from "@/components/delete-transaction-button";
import type { Location, TransactionWithRefs } from "@/lib/types";

type SearchParams = {
  jaar?: string;
  location?: string;
  q?: string;
};

export default async function TransactiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("*")
    .order("sort_order");

  let q = supabase
    .from("v_transactions")
    .select("*")
    .order("datum", { ascending: false })
    .order("boekstuk", { ascending: false });

  if (sp.jaar && sp.jaar !== "all") {
    const y = parseInt(sp.jaar, 10);
    if (Number.isFinite(y)) {
      q = q.gte("datum", `${y}-01-01`).lte("datum", `${y}-12-31`);
    }
  }
  if (sp.location && sp.location !== "all") {
    q = q.eq("location_id", parseInt(sp.location, 10));
  }
  if (sp.q) {
    q = q.ilike("omschrijving", `%${sp.q}%`);
  }

  const { data: rows } = await q.limit(500);

  // Distinct years derived from data — fallback to current year if empty
  const allYears = new Set<number>();
  for (const r of rows ?? []) allYears.add(r.jaar);
  if (allYears.size === 0) allYears.add(new Date().getFullYear());
  const years = Array.from(allYears).sort((a, b) => b - a);

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Transacties</h1>
        <Button asChild>
          <Link href="/protected/transacties/nieuw">Nieuwe transactie</Link>
        </Button>
      </div>

      <TransactiesFilters
        locations={(locations as Location[]) ?? []}
        years={years}
      />

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2 font-medium">Datum</th>
              <th className="p-2 font-medium">Locatie</th>
              <th className="p-2 font-medium">Bk.</th>
              <th className="p-2 font-medium">Grootboek</th>
              <th className="p-2 font-medium">BTW Code</th>
              <th className="p-2 font-medium text-right">Inkomsten</th>
              <th className="p-2 font-medium text-right">BTW in</th>
              <th className="p-2 font-medium text-right">Uitgaven</th>
              <th className="p-2 font-medium text-right">BTW uit</th>
              <th className="p-2 font-medium">Omschrijving</th>
              <th className="p-2 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {(rows as TransactionWithRefs[] | null)?.length === 0 && (
              <tr>
                <td colSpan={11} className="p-4 text-center text-muted-foreground">
                  Geen transacties gevonden.
                </td>
              </tr>
            )}
            {(rows as TransactionWithRefs[] | null)?.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/20">
                <td className="p-2 whitespace-nowrap">{formatDate(r.datum)}</td>
                <td className="p-2 whitespace-nowrap">{r.location_name}</td>
                <td className="p-2 text-muted-foreground">{r.boekstuk}</td>
                <td className="p-2 whitespace-nowrap">
                  {r.ledger_code ? `${r.ledger_code} ${r.ledger_name}` : "—"}
                </td>
                <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                  {r.btw_label ?? "—"}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  {formatEuro(r.bedrag_inkomsten)}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  {formatEuro(r.btw_inkomsten)}
                </td>
                <td className="p-2 text-right whitespace-nowrap text-red-700">
                  {formatEuro(r.bedrag_uitgaven)}
                </td>
                <td className="p-2 text-right whitespace-nowrap text-red-700">
                  {formatEuro(r.btw_uitgaven)}
                </td>
                <td className="p-2 max-w-xs truncate">{r.omschrijving}</td>
                <td className="p-2 whitespace-nowrap text-right">
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                    <Link href={`/protected/transacties/${r.id}`}>Bewerk</Link>
                  </Button>
                  <DeleteTransactionButton id={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {(rows as unknown[] | null)?.length ?? 0} resultaten (max 500 per pagina).
      </p>
    </>
  );
}
