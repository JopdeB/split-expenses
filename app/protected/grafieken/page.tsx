import { createClient } from "@/lib/supabase/server";
import { YearFilter } from "@/components/year-filter";
import { UitgavenPerMaandChart } from "@/components/charts/uitgaven-per-maand";
import { TopCategorienChart } from "@/components/charts/top-categorien";
import { InkomstenUitgavenChart } from "@/components/charts/inkomsten-uitgaven";
import type { TransactionWithRefs } from "@/lib/types";

type SearchParams = { jaar?: string };

const MAANDEN = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
const KWARTALEN = ["Q1", "Q2", "Q3", "Q4"];
const TOP_N = 10;

export default async function GrafiekenPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  // Years available from the data
  const { data: yearRows } = await supabase
    .from("v_transactions")
    .select("jaar");
  const years = Array.from(
    new Set(((yearRows ?? []) as Array<{ jaar: number }>).map((r) => r.jaar)),
  ).sort((a, b) => b - a);
  if (years.length === 0) years.push(new Date().getFullYear());

  const selectedYear = parseInt(sp.jaar ?? "", 10);
  const jaar = Number.isFinite(selectedYear) ? selectedYear : years[0];

  const { data: txData } = await supabase
    .from("v_transactions")
    .select("*")
    .gte("datum", `${jaar}-01-01`)
    .lte("datum", `${jaar}-12-31`);

  const transactions = (txData as TransactionWithRefs[] | null) ?? [];

  // ---- Chart 1: uitgaven per maand per locatie ----
  const locationNames = Array.from(
    new Set(transactions.map((t) => t.location_name).filter((n): n is string => !!n)),
  ).sort();
  const maandMap = new Map<number, Record<string, number>>();
  for (let m = 0; m < 12; m++) maandMap.set(m, {});
  for (const t of transactions) {
    const uitN = Number(t.bedrag_uitgaven) || 0;
    const btwUit = Number(t.btw_uitgaven) || 0;
    const exclBtw = uitN - btwUit;
    if (exclBtw <= 0) continue;
    if (!t.location_name) continue;
    const month = new Date(t.datum).getMonth();
    const bucket = maandMap.get(month)!;
    bucket[t.location_name] = (bucket[t.location_name] ?? 0) + exclBtw;
  }
  const uitgavenPerMaand = Array.from(maandMap.entries()).map(([m, perLoc]) => ({
    maand: MAANDEN[m],
    ...perLoc,
  }));

  // ---- Chart 2: top kosten-categorieën ----
  const ledgerTotals = new Map<string, number>();
  for (const t of transactions) {
    const uitN = Number(t.bedrag_uitgaven) || 0;
    const btwUit = Number(t.btw_uitgaven) || 0;
    const exclBtw = uitN - btwUit;
    if (exclBtw <= 0) continue;
    const label = t.ledger_code
      ? `${t.ledger_code} ${t.ledger_name ?? ""}`.trim()
      : "— Geen grootboek —";
    ledgerTotals.set(label, (ledgerTotals.get(label) ?? 0) + exclBtw);
  }
  const topCategorien = Array.from(ledgerTotals.entries())
    .map(([ledger, uitgaven]) => ({ ledger: truncate(ledger, 28), uitgaven }))
    .sort((a, b) => b.uitgaven - a.uitgaven)
    .slice(0, TOP_N);

  // ---- Chart 3: inkomsten vs uitgaven per kwartaal ----
  const kwartaalMap = new Map<string, { inkomsten: number; uitgaven: number; deeluitgaven: number }>();
  for (const q of KWARTALEN) kwartaalMap.set(q, { inkomsten: 0, uitgaven: 0, deeluitgaven: 0 });
  for (const t of transactions) {
    if (!t.kwartaal) continue;
    const bucket = kwartaalMap.get(t.kwartaal);
    if (!bucket) continue;
    bucket.inkomsten += (Number(t.bedrag_inkomsten) || 0) - (Number(t.btw_inkomsten) || 0);
    bucket.uitgaven += (Number(t.bedrag_uitgaven) || 0) - (Number(t.btw_uitgaven) || 0);
    bucket.deeluitgaven += (Number(t.bedrag_deeluitgaven) || 0) - (Number(t.btw_deeluitgaven) || 0);
  }
  const inkomstenUitgaven = Array.from(kwartaalMap.entries()).map(([kwartaal, v]) => ({
    kwartaal,
    inkomsten: round2(v.inkomsten),
    uitgaven: round2(v.uitgaven),
    deeluitgaven: round2(v.deeluitgaven),
  }));

  const isEmpty = transactions.length === 0;

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Grafieken</h1>
        <YearFilter years={years} />
      </div>

      <p className="text-xs text-muted-foreground">
        Bedragen exclusief BTW. Filtert op het geselecteerde jaar.
      </p>

      {isEmpty && (
        <p className="p-4 text-center text-muted-foreground text-sm border rounded-md">
          Geen transacties in {jaar}.
        </p>
      )}

      {!isEmpty && (
        <>
          <ChartSection title="Uitgaven per maand">
            <UitgavenPerMaandChart
              data={uitgavenPerMaand}
              locationNames={locationNames}
            />
          </ChartSection>

          <ChartSection title="Top kosten-categorieën">
            {topCategorien.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Geen uitgaven in dit jaar.</p>
            ) : (
              <TopCategorienChart data={topCategorien} />
            )}
          </ChartSection>

          <ChartSection title="Inkomsten / uitgaven per kwartaal">
            <InkomstenUitgavenChart data={inkomstenUitgaven} />
          </ChartSection>
        </>
      )}
    </>
  );
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border rounded-md p-3 md:p-4">
      <h2 className="text-sm font-medium mb-3">{title}</h2>
      {children}
    </section>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
