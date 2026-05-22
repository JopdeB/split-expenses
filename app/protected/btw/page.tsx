import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/format";
import { YearFilter } from "@/components/year-filter";
import type { BtwQuarterRow, Location } from "@/lib/types";

type SearchParams = { jaar?: string };

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export default async function BtwPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: locations }, { data: yearRows }] = await Promise.all([
    supabase.from("locations").select("*").order("sort_order"),
    supabase.from("v_btw_quarterly").select("jaar"),
  ]);

  const locs = (locations as Location[]) ?? [];
  const years = Array.from(
    new Set((yearRows ?? []).map((r) => r.jaar as number))
  ).sort((a, b) => b - a);
  if (years.length === 0) years.push(new Date().getFullYear());

  const selectedYear = parseInt(sp.jaar ?? "", 10);
  const jaar = Number.isFinite(selectedYear) ? selectedYear : years[0];

  const { data: rows } = await supabase
    .from("v_btw_quarterly")
    .select("*")
    .eq("jaar", jaar);

  // Build lookup: locationId -> quarter -> {in, uit, net}
  const lookup = new Map<
    number,
    Map<string, { in: number; uit: number; net: number }>
  >();
  for (const r of (rows as BtwQuarterRow[] | null) ?? []) {
    let perQ = lookup.get(r.location_id);
    if (!perQ) {
      perQ = new Map();
      lookup.set(r.location_id, perQ);
    }
    perQ.set(r.kwartaal, {
      in: Number(r.btw_inkomsten) || 0,
      uit: Number(r.btw_uitgaven) || 0,
      net: Number(r.btw_netto) || 0,
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
                            href={`/api/export/pdf?jaar=${jaar}&kwartaal=${q}`}
                            className="text-xs underline text-muted-foreground hover:text-foreground"
                            download
                            title={`Download ${q} ${jaar} als PDF`}
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
