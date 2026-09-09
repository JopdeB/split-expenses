import Link from "next/link";
import { desc } from "drizzle-orm";

import { db, tables } from "@/lib/db";
import { formatEuro } from "@/lib/format";
import type { AuditRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Column names in the JSONB before/after payloads mirror the DB schema
// (snake_case), because they come from to_jsonb(NEW)/to_jsonb(OLD) inside
// the trigger. Keep these labels as snake_case so the lookup works.
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

const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "created_by"]);

type Action = "insert" | "update" | "delete";

export default async function AuditPage() {
  const [locations, ledgers, btwCodes, rows] = await Promise.all([
    db.select().from(tables.locations),
    db.select().from(tables.ledgerAccounts),
    db.select().from(tables.btwCodes),
    db.select().from(tables.auditLog).orderBy(desc(tables.auditLog.ts)).limit(200),
  ]);

  const locMap = new Map(locations.map((l) => [l.id, l.name]));
  const ledgerMap = new Map(ledgers.map((l) => [l.id, `${l.code} ${l.name}`]));
  const btwMap = new Map(btwCodes.map((b) => [b.id, b.label]));

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

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Audit-log</h1>
      </div>

      <p className="text-xs text-muted-foreground">
        Alle insert/update/delete op transacties, automatisch gelogd door de database.
        Laatste 200 events.
      </p>

      {rows.length === 0 && (
        <p className="p-4 text-center text-muted-foreground text-sm border rounded-md">
          Nog geen audit-events. Voeg een transactie toe om te beginnen.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const tsLabel = r.ts.toLocaleString("nl-NL", {
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
                  <ActionBadge action={r.action as Action} />
                  <Link
                    href={`/protected/transacties/${r.entityId}`}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Transactie #{r.entityId}
                  </Link>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {tsLabel} · {r.userEmail ?? "onbekend"}
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

function ActionBadge({ action }: { action: Action }) {
  const styles: Record<Action, string> = {
    insert: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
    update: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
    delete: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  };
  const labels: Record<Action, string> = {
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
  const before = (r.before ?? null) as Record<string, unknown> | null;
  const after = (r.after ?? null) as Record<string, unknown> | null;

  if (r.action === "insert" && after) {
    for (const [k, v] of Object.entries(after)) {
      if (HIDDEN_FIELDS.has(k)) continue;
      if (v === null || v === 0 || v === "") continue;
      out.push({ label: FIELD_LABELS[k] ?? k, after: renderValue(k, v) });
    }
  } else if (r.action === "delete" && before) {
    for (const [k, v] of Object.entries(before)) {
      if (HIDDEN_FIELDS.has(k)) continue;
      if (v === null || v === 0 || v === "") continue;
      out.push({ label: FIELD_LABELS[k] ?? k, before: renderValue(k, v) });
    }
  } else if (r.action === "update" && before && after) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      if (HIDDEN_FIELDS.has(k)) continue;
      const a = before[k];
      const b = after[k];
      if (a === b || (a == null && b == null)) continue;
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
