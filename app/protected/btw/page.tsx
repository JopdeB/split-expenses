import { asc, desc, eq } from "drizzle-orm";

import { db, tables } from "@/lib/db";
import { formatEuro } from "@/lib/format";
import { YearFilter } from "@/components/year-filter";

type SearchParams = { jaar?: string };

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export default async function BtwPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const [locs, yearRows] = await Promise.all([
    db.select().from(tables.locations).orderBy(asc(tables.locations.sortOrder)),
    db
      .selectDistinct({ jaar: tables.vBtwQuarterly.jaar })
      .from(tables.vBtwQuarterly)
      .orderBy(desc(tables.vBtwQuarterly.jaar)),
  ]);

  const years = yearRows.map((r) => r.jaar);
  if (years.length === 0) years.push(new Date().getFullYear());

  const selectedYear = parseInt(sp.jaar ?? "", 10);
  const jaar = Number.isFinite(selectedYear) ? selectedYear : years[0];

  const rows = await db
    .select()
    .from(tables.vBtwQuarterly)
    .where(eq(tables.vBtwQuarterly.jaar, jaar));

  // Build lookup: locationId -> quarter -> {in, uit, net}
  const lookup = new Map<
    number,
    Map<string, { in: number; uit: number; net: number }>
  >();
  for (const r of rows) {
    let perQ = lookup.get(r.locationId);
    if (!perQ) {
      perQ = new Map();
      lookup.set(r.locationId, perQ);
    }
    perQ.set(r.kwartaal, {
      in: Number(r.btwInkomsten) || 0,
      uit: Number(r.btwUitgaven) || 0,
      net: Number(r.btwNetto) || 0,
    });
  }

  function cell(locId: number, q: string) {
    return lookup.get(locId)?.get(q) ?? { in: 0, uit: 0, net: 0 };
  }

  function totalForLocation(locId: number) {
    let i = 0, u = 0, n = 0;
    for (const q of QUARTERS) {
      const c = cell(locId, q);
      i += c.in; u += c.uit; n += c.net;
    }
    return { in: i, uit: u, net: n };
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">BTW Kwartaaloverzicht</h1>
        <YearFilter years={years} />
      </div>

      <p className="text-xs text-muted-foreground">
        BTW-bedragen per kwartaal, per locatie. Negatieve netto = teruggaaf.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {locs.map((l) => {
          const total = totalForLocation(l.id);
          return (
            <div key={l.id} className="border rounded-md overflow-hidden">
              <div className="p-3 bg-muted/40 font-medium">{l.name}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="p-2 font-normal">Periode</th>
                    <th className="p-2 font-normal text-right">BTW inkomsten</th>
                    <th className="p-2 font-normal text-right">BTW uitgaven</th>
                    <th className="p-2 font-normal text-right">Netto BTW</th>
                    <th className="p-2 font-normal text-right w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {QUARTERS.map((q) => {
                    const c = cell(l.id, q);
                    return (
                      <tr key={q} className="border-t">
                        <td className="p-2">{q}</td>
                        <td className="p-2 text-right">{formatEuro(c.in)}</td>
                        <td className="p-2 text-right text-red-700">
                          {formatEuro(c.uit)}
                        </td>
                        <td
                          className={
                            "p-2 text-right font-medium " +
                            (c.net < 0 ? "text-red-700" : "")
                          }
                        >
                          {formatEuro(c.net)}
                        </td>
                        <td className="p-2 text-right">
                          <a
                            href={`/api/export/pdf?jaar=${jaar}&kwartaal=${q}&location=${l.id}`}
                            className="text-xs underline text-muted-foreground hover:text-foreground"
                            download
                            title={`Download ${q} ${jaar} ${l.name} als PDF`}
                          >
                            PDF
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-t-2 font-medium bg-muted/30">
                    <td className="p-2">Totaal {jaar}</td>
                    <td className="p-2 text-right">{formatEuro(total.in)}</td>
                    <td className="p-2 text-right text-red-700">
                      {formatEuro(total.uit)}
                    </td>
                    <td
                      className={
                        "p-2 text-right " +
                        (total.net < 0 ? "text-red-700" : "")
                      }
                    >
                      {formatEuro(total.net)}
                    </td>
                    <td className="p-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}
