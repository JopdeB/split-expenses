import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/format";
import { YearFilter } from "@/components/year-filter";
import type { GrootboekRow, LedgerAccount, Location } from "@/lib/types";

type SearchParams = { jaar?: string };

export default async function GrootboekPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: locations }, { data: ledgerAccounts }, { data: yearRows }] =
    await Promise.all([
      supabase.from("locations").select("*").order("sort_order"),
      supabase.from("ledger_accounts").select("*").order("sort_order"),
      supabase.from("v_grootboek").select("jaar"),
    ]);

  const locs = (locations as Location[]) ?? [];
  const accounts = (ledgerAccounts as LedgerAccount[]) ?? [];
  const years = Array.from(
    new Set((yearRows ?? []).map((r) => r.jaar as number))
  ).sort((a, b) => b - a);
  if (years.length === 0) years.push(new Date().getFullYear());

  const selectedYear = parseInt(sp.jaar ?? "", 10);
  const jaar = Number.isFinite(selectedYear) ? selectedYear : years[0];

  const { data: rows } = await supabase
    .from("v_grootboek")
    .select("*")
    .eq("jaar", jaar);

  // Build lookup: ledgerId -> locationId -> {in, uit, deel, netto}
  const lookup = new Map<number, Map<number, { in: number; uit: number; deel: number; net: number }>>();
  for (const r of (rows as GrootboekRow[] | null) ?? []) {
    let perLoc = lookup.get(r.ledger_account_id);
    if (!perLoc) {
      perLoc = new Map();
      lookup.set(r.ledger_account_id, perLoc);
    }
    perLoc.set(r.location_id, {
      in: Number(r.inkomsten) || 0,
      uit: Number(r.uitgaven) || 0,
      deel: Number(r.deeluitgaven) || 0,
      net: Number(r.netto) || 0,
    });
  }

  function cell(ledgerId: number, locId: number) {
    return lookup.get(ledgerId)?.get(locId) ?? { in: 0, uit: 0, deel: 0, net: 0 };
  }

  function totalForLocation(locId: number) {
    let i = 0, u = 0, d = 0, n = 0;
    for (const acc of accounts) {
      const c = cell(acc.id, locId);
      i += c.in; u += c.uit; d += c.deel; n += c.net;
    }
    return { in: i, uit: u, deel: d, net: n };
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Grootboek Overzicht</h1>
        <YearFilter years={years} />
      </div>

      <p className="text-xs text-muted-foreground">
        Bedragen exclusief BTW. Per locatie: inkomsten, uitgaven, deeluitgaven en netto.
        Deeluitgaven worden door de boekhouder aan jaareinde gesplitst (% privé/zakelijk)
        en zitten daarom niet in netto.
      </p>

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2 font-medium" rowSpan={2}>Grootboek</th>
              {locs.map((l) => (
                <th key={l.id} className="p-2 font-medium text-center border-l" colSpan={4}>
                  {l.name}
                </th>
              ))}
              <th className="p-2 font-medium text-center border-l bg-muted/60" colSpan={4}>
                Totaal
              </th>
            </tr>
            <tr>
              {[...locs.map((l) => l.id), -1].map((id) => (
                <Cols key={id} />
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => {
              let tIn = 0, tUit = 0, tDeel = 0, tNet = 0;
              return (
                <tr key={acc.id} className="border-t hover:bg-muted/20">
                  <td className="p-2 whitespace-nowrap">
                    <span className="text-muted-foreground mr-1">{acc.code}</span>
                    {acc.name}
                  </td>
                  {locs.map((l) => {
                    const c = cell(acc.id, l.id);
                    tIn += c.in; tUit += c.uit; tDeel += c.deel; tNet += c.net;
                    return (
                      <CellGroup key={l.id} value={c} />
                    );
                  })}
                  <CellGroup
                    value={{ in: tIn, uit: tUit, deel: tDeel, net: tNet }}
                    emphasis
                  />
                </tr>
              );
            })}
            <tr className="border-t border-t-2 font-medium bg-muted/30">
              <td className="p-2">Totaal {jaar}</td>
              {locs.map((l) => {
                const c = totalForLocation(l.id);
                return <CellGroup key={l.id} value={c} emphasis />;
              })}
              <CellGroup
                value={(() => {
                  let i = 0, u = 0, d = 0, n = 0;
                  for (const l of locs) {
                    const c = totalForLocation(l.id);
                    i += c.in; u += c.uit; d += c.deel; n += c.net;
                  }
                  return { in: i, uit: u, deel: d, net: n };
                })()}
                emphasis
              />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Cols() {
  return (
    <>
      <th className="p-2 font-normal text-xs text-muted-foreground text-right border-l">
        Inkomsten
      </th>
      <th className="p-2 font-normal text-xs text-muted-foreground text-right">
        Uitgaven
      </th>
      <th className="p-2 font-normal text-xs text-muted-foreground text-right">
        Deeluitgaven
      </th>
      <th className="p-2 font-normal text-xs text-muted-foreground text-right">
        Netto
      </th>
    </>
  );
}

function CellGroup({
  value,
  emphasis,
}: {
  value: { in: number; uit: number; deel: number; net: number };
  emphasis?: boolean;
}) {
  return (
    <>
      <td className={"p-2 text-right whitespace-nowrap border-l " + (emphasis ? "bg-muted/30" : "")}>
        {formatEuro(value.in)}
      </td>
      <td className={"p-2 text-right whitespace-nowrap text-red-700 " + (emphasis ? "bg-muted/30" : "")}>
        {formatEuro(value.uit)}
      </td>
      <td className={"p-2 text-right whitespace-nowrap text-amber-700 " + (emphasis ? "bg-muted/30" : "")}>
        {formatEuro(value.deel)}
      </td>
      <td className={"p-2 text-right whitespace-nowrap font-medium " + (emphasis ? "bg-muted/30" : "") + (value.net < 0 ? " text-red-700" : "")}>
        {formatEuro(value.net)}
      </td>
    </>
  );
}
