import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";

import { db, tables } from "@/lib/db";
import { formatDate, formatEuro } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TransactiesFilters } from "@/components/transacties-filters";
import { DeleteTransactionButton } from "@/components/delete-transaction-button";

type SearchParams = {
  jaar?: string;
  location?: string;
  ledger?: string;
  q?: string;
};

export default async function TransactiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const [locations, ledgerAccounts] = await Promise.all([
    db.select().from(tables.locations).orderBy(asc(tables.locations.sortOrder)),
    db.select().from(tables.ledgerAccounts).orderBy(asc(tables.ledgerAccounts.sortOrder)),
  ]);

  const filters: SQL[] = [];
  if (sp.jaar && sp.jaar !== "all") {
    const y = parseInt(sp.jaar, 10);
    if (Number.isFinite(y)) {
      filters.push(gte(tables.vTransactions.datum, `${y}-01-01`));
      filters.push(lte(tables.vTransactions.datum, `${y}-12-31`));
    }
  }
  if (sp.location && sp.location !== "all") {
    filters.push(eq(tables.vTransactions.locationId, parseInt(sp.location, 10)));
  }
  if (sp.ledger && sp.ledger !== "all") {
    filters.push(eq(tables.vTransactions.ledgerAccountId, parseInt(sp.ledger, 10)));
  }
  if (sp.q) {
    // Match on either omschrijving or grootboek code (so typing "8000"
    // finds all huurinkomsten).
    const term = `%${sp.q}%`;
    const orClause = or(
      ilike(tables.vTransactions.omschrijving, term),
      ilike(tables.vTransactions.ledgerCode, term),
    );
    if (orClause) filters.push(orClause);
  }

  const rows = await db
    .select()
    .from(tables.vTransactions)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(tables.vTransactions.datum), desc(tables.vTransactions.boekstuk))
    .limit(500);

  // Distinct years derived from data — fallback to current year if empty
  const allYears = new Set<number>();
  for (const r of rows) allYears.add(r.jaar);
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
        locations={locations}
        ledgerAccounts={ledgerAccounts}
        years={years}
      />

      {/* Mobile: card layout */}
      <div className="md:hidden flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="p-4 text-center text-muted-foreground text-sm border rounded-md">
            Geen transacties gevonden.
          </p>
        )}
        {rows.map((r) => {
          const inN = Number(r.bedragInkomsten) || 0;
          const uitN = Number(r.bedragUitgaven) || 0;
          const deelN = Number(r.bedragDeeluitgaven) || 0;
          // Pick the dominant amount + color
          let amount = 0;
          let amountClass = "";
          if (inN > 0) {
            amount = inN;
            amountClass = "text-foreground";
          } else if (uitN > 0) {
            amount = -uitN;
            amountClass = "text-red-700";
          } else if (deelN > 0) {
            amount = -deelN;
            amountClass = "text-amber-700";
          }
          return (
            <Link
              key={r.id}
              href={`/protected/transacties/${r.id}`}
              className="block border rounded-md p-3 active:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {formatDate(r.datum)} · {r.locationName}
                    {r.boekstuk ? ` · #${r.boekstuk}` : ""}
                  </div>
                  <div className="text-sm font-medium truncate">
                    {r.ledgerCode ? `${r.ledgerCode} ${r.ledgerName}` : "Geen grootboek"}
                  </div>
                  {r.omschrijving && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.omschrijving}
                    </div>
                  )}
                </div>
                <div className={"text-base font-semibold whitespace-nowrap " + amountClass}>
                  {amount === 0 ? "—" : formatEuro(amount)}
                </div>
              </div>
              {(Number(r.btwInkomsten) || Number(r.btwUitgaven) || Number(r.btwDeeluitgaven)) && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  BTW: {formatEuro(
                    Number(r.btwInkomsten) ||
                      Number(r.btwUitgaven) ||
                      Number(r.btwDeeluitgaven),
                  )}
                  {r.btwLabel ? ` · ${r.btwLabel}` : ""}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden md:block border rounded-md overflow-x-auto">
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
              <th className="p-2 font-medium text-right">Deeluitgaven</th>
              <th className="p-2 font-medium text-right">BTW deel</th>
              <th className="p-2 font-medium">Omschrijving</th>
              <th className="p-2 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="p-4 text-center text-muted-foreground">
                  Geen transacties gevonden.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/20">
                <td className="p-2 whitespace-nowrap">{formatDate(r.datum)}</td>
                <td className="p-2 whitespace-nowrap">{r.locationName}</td>
                <td className="p-2 text-muted-foreground">{r.boekstuk}</td>
                <td className="p-2 whitespace-nowrap">
                  {r.ledgerCode ? `${r.ledgerCode} ${r.ledgerName}` : "—"}
                </td>
                <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                  {r.btwLabel ?? "—"}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  {formatEuro(r.bedragInkomsten)}
                </td>
                <td className="p-2 text-right whitespace-nowrap">
                  {formatEuro(r.btwInkomsten)}
                </td>
                <td className="p-2 text-right whitespace-nowrap text-red-700">
                  {formatEuro(r.bedragUitgaven)}
                </td>
                <td className="p-2 text-right whitespace-nowrap text-red-700">
                  {formatEuro(r.btwUitgaven)}
                </td>
                <td className="p-2 text-right whitespace-nowrap text-amber-700">
                  {formatEuro(r.bedragDeeluitgaven)}
                </td>
                <td className="p-2 text-right whitespace-nowrap text-amber-700">
                  {formatEuro(r.btwDeeluitgaven)}
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
        {rows.length} resultaten (max 500 per pagina).
      </p>
    </>
  );
}
