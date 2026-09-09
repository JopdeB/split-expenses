import Link from "next/link";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";

import { db, tables } from "@/lib/db";
import { getSession } from "@/lib/session";
import { formatEuro } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProtectedPage() {
  const session = await getSession();
  if (!session.userId) redirect("/auth/login");

  const [btw, latest] = await Promise.all([
    db
      .select({
        jaar: tables.vBtwQuarterly.jaar,
        btwInkomsten: tables.vBtwQuarterly.btwInkomsten,
        btwUitgaven: tables.vBtwQuarterly.btwUitgaven,
        btwNetto: tables.vBtwQuarterly.btwNetto,
      })
      .from(tables.vBtwQuarterly),
    db
      .select({
        id: tables.vTransactions.id,
        datum: tables.vTransactions.datum,
        locationName: tables.vTransactions.locationName,
        omschrijving: tables.vTransactions.omschrijving,
        bedragInkomsten: tables.vTransactions.bedragInkomsten,
        bedragUitgaven: tables.vTransactions.bedragUitgaven,
      })
      .from(tables.vTransactions)
      .orderBy(desc(tables.vTransactions.datum))
      .limit(5),
  ]);

  const yearTotals = new Map<number, { in: number; uit: number; net: number }>();
  for (const r of btw) {
    const prev = yearTotals.get(r.jaar) ?? { in: 0, uit: 0, net: 0 };
    prev.in += Number(r.btwInkomsten) || 0;
    prev.uit += Number(r.btwUitgaven) || 0;
    prev.net += Number(r.btwNetto) || 0;
    yearTotals.set(r.jaar, prev);
  }
  const years = Array.from(yearTotals.keys()).sort((a, b) => b - a);

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/protected/grafieken">Grafieken</Link>
          </Button>
          <Button asChild>
            <Link href="/protected/transacties/nieuw">Nieuwe transactie</Link>
          </Button>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          BTW per jaar (alle locaties)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {years.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-3">
              Nog geen transacties.
            </p>
          )}
          {years.map((y) => {
            const t = yearTotals.get(y)!;
            return (
              <Card key={y}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{y}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BTW inkomsten</span>
                    <span>{formatEuro(t.in)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BTW uitgaven</span>
                    <span>{formatEuro(t.uit)}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-1 border-t">
                    <span>Netto BTW</span>
                    <span className={t.net < 0 ? "text-red-600" : ""}>
                      {formatEuro(t.net)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Laatste transacties
        </h2>
        <div className="border rounded-md">
          {latest.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">
              Geen transacties gevonden.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {latest.map((t) => (
                  <tr key={t.id} className="border-b last:border-b-0">
                    <td className="p-2 text-muted-foreground whitespace-nowrap">
                      {new Date(t.datum).toLocaleDateString("nl-NL")}
                    </td>
                    <td className="p-2">{t.locationName}</td>
                    <td className="p-2 max-w-md truncate">
                      {t.omschrijving}
                    </td>
                    <td className="p-2 text-right">
                      {Number(t.bedragInkomsten) > 0
                        ? formatEuro(t.bedragInkomsten)
                        : ""}
                    </td>
                    <td className="p-2 text-right text-red-700">
                      {Number(t.bedragUitgaven) > 0
                        ? "− " + formatEuro(t.bedragUitgaven)
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
