import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/format";
import type { BtwCode, LedgerAccount, Location } from "@/lib/types";

type AuditRow = {
  id: number;
  ts: string;
  user_id: string | null;
  user_email: string | null;
  action: "insert" | "update" | "delete";
  entity_type: string;
  entity_id: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const FIELD_LABELS: Record<string, string> = {
  datum: "Datum",
  location_id: "Locatie",
  boekstuk: "Boekstuk nr.",
  ledger_account_id: "Grootboek",
  btw_code_id: "BTW Code",
  bedrag_inkomsten: "Bedrag inkomsten",
  btw_inkomsten: "BTW inkomsten",
  bedrag_uitgaven: "Bedrag uitgaven",
  btw_uitgaven: "BTW uitgaven",
  bedrag_deeluitgaven: "Bedrag deeluitgaven",
  btw_deeluitgaven: "BTW deeluitgaven",
  omschrijving: "Omschrijving",
};

const MONEY_FIELDS = new Set([
  "bedrag_inkomsten",
  "btw_inkomsten",
  "bedrag_uitgaven",
  "btw_uitgaven",
  "bedrag_deeluitgaven",
  "btw_deeluitgaven",
]);

// Internal/system fields we don't show in diffs.
const HIDDEN_FIELDS = new Set(["id", "created_at"]);

export default async function AuditPage() {
  const supabase = await createClient();

  // Fetch lookups so we can render readable labels for id fields.
  const [{ data: locations }, { data: ledgers }, { data: btwCodes }] = await Promise.all([
    supabase.from("locations").select("*"),
    supabase.from("ledger_accounts").select("*"),
    supabase.from("btw_codes").select("*"),
  ]);
  const locMap = new Map<number, string>(
    ((locations as Location[]) ?? []).map((l) => [l.id, l.name]),
  );
  const ledgerMap = new Map<number, string>(
    ((ledgers as LedgerAccount[]) ?? []).map((l) => [l.id, `${l.code} ${l.name}`]),
  );
  const btwMap = new Map<number, string>(
    ((btwCodes as BtwCode[]) ?? []).map((b) => [b.id, b.label]),
  );

  function renderValue(field: string, val: unknown): string {
    if (val === null || val === undefined || val === "") return "—";
    if (field === "location_id" && typeof val === "number") return locMap.get(val) ?? `#${val}`;
    if (field === "ledger_account_id" && typeof val === "number")
      return ledgerMap.get(val) ?? `#${val}`;
    if (field === "btw_code_id" && typeof val === "number") return btwMap.get(val) ?? `#${val}`;
    if (MONEY_FIELDS.has(field)) {
      const n = typeof val === "number" ? val : parseFloat(String(val));
      if (Number.isFinite(n)) return n === 0 ? "—" : formatEuro(n);
    }
    if (field === "datum") {
      return new Date(String(val)).toLocaleDateString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return String(val);
  }

  // Fetch latest entries. We swallow errors so the page shows a friendly
  // "not yet set up" message if migration_003 hasn't been run.
  const { data: rows, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("ts", { ascending: false })
    .limit(200);

  const tableMissing =
    !!error &&
    (error.message?.includes("audit_log") || error.code === "42P01");

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Audit-log</h1>
      </div>

      <p className="text-xs text-muted-foreground">
        Alle insert/update/delete op transacties, automatisch gelogd door de database.
        Laatste 200 events.
      </p>

      {tableMissing && (
        <div className="border rounded-md p-4 text-sm bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
          <p className="font-medium mb-1">Audit-log nog niet geactiveerd</p>
          <p className="text-xs text-muted-foreground">
            Draai <code>supabase/migration_003_audit_log.sql</code> in de Supabase
            SQL Editor om de audit-tabel en trigger aan te maken. Daarna verschijnen
            hier de events vanaf het moment van activeren.
          </p>
        </div>
      )}

      {error && !tableMissing && (
        <div className="border rounded-md p-4 text-sm bg-red-50 border-red-200">
          <p className="font-medium">Kon audit-log niet laden</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </div>
      )}

      {!error && (rows as AuditRow[] | null)?.length === 0 && (
        <p className="p-4 text-center text-muted-foreground text-sm border rounded-md">
          Nog geen audit-events. Voeg een transactie toe om te beginnen.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {((rows as AuditRow[] | null) ?? []).map((r) => {
          const ts = new Date(r.ts);
          const tsLabel = ts.toLocaleString("nl-NL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          const changes = computeChanges(r, renderValue);

          return (
            <div key={r.id} className="border rounded-md p-3">
              <div className="flex items-start justify-between flex-wrap gap-2 text-sm">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <ActionBadge action={r.action} />
                  <Link
                    href={`/protected/transacties/${r.entity_id}`}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Transactie #{r.entity_id}
                  </Link>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {tsLabel} · {r.user_email ?? "onbekend"}
                </div>
              </div>

              {changes.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5 text-xs">
                  {changes.map((c, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground">{c.label}:</span>
                      {c.before !== undefined && (
                        <span className="text-muted-foreground line-through">
                          {c.before}
                        </span>
                      )}
                      {c.before !== undefined && c.after !== undefined && (
                        <span className="text-muted-foreground">→</span>
                      )}
                      {c.after !== undefined && (
                        <span className="font-medium">{c.after}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ActionBadge({ action }: { action: AuditRow["action"] }) {
  const styles: Record<AuditRow["action"], string> = {
    insert: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
    update: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
    delete: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  };
  const labels: Record<AuditRow["action"], string> = {
    insert: "Toegevoegd",
    update: "Bewerkt",
    delete: "Verwijderd",
  };
  return (
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded ${styles[action]}`}>
      {labels[action]}
    </span>
  );
}

function computeChanges(
  r: AuditRow,
  renderValue: (field: string, val: unknown) => string,
): Array<{ label: string; before?: string; after?: string }> {
  const out: Array<{ label: string; before?: string; after?: string }> = [];
  if (r.action === "insert" && r.after) {
    for (const [k, v] of Object.entries(r.after)) {
      if (HIDDEN_FIELDS.has(k)) continue;
      if (v === null || v === 0 || v === "") continue;
      out.push({ label: FIELD_LABELS[k] ?? k, after: renderValue(k, v) });
    }
  } else if (r.action === "delete" && r.before) {
    for (const [k, v] of Object.entries(r.before)) {
      if (HIDDEN_FIELDS.has(k)) continue;
      if (v === null || v === 0 || v === "") continue;
      out.push({ label: FIELD_LABELS[k] ?? k, before: renderValue(k, v) });
    }
  } else if (r.action === "update" && r.before && r.after) {
    const keys = new Set([...Object.keys(r.before), ...Object.keys(r.after)]);
    for (const k of keys) {
      if (HIDDEN_FIELDS.has(k)) continue;
      const a = r.before[k];
      const b = r.after[k];
      // Strict equality on JSONB scalars; for numbers JSONB roundtrip is fine.
      if (a === b || (a == null && b == null)) continue;
      // Treat 0/"" as null-ish so empty→empty doesn't show as change.
      const normA = a === "" ? null : a;
      const normB = b === "" ? null : b;
      if (normA === normB) continue;
      out.push({
        label: FIELD_LABELS[k] ?? k,
        before: renderValue(k, a),
        after: renderValue(k, b),
      });
    }
  }
  return out;
}
