"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BtwCode, LedgerAccount, Location, Transaction } from "@/lib/types";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  locations: Location[];
  ledgerAccounts: LedgerAccount[];
  btwCodes: BtwCode[];
  initial?: Partial<Transaction> | null;
  submitLabel: string;
};

function fmtDecimal(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n === 0) return "";
  return n.toString().replace(".", ",");
}

function parseDecimal(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function TransactieForm({
  action,
  locations,
  ledgerAccounts,
  btwCodes,
  initial,
  submitLabel,
}: Props) {
  const [bedragIn, setBedragIn] = useState(fmtDecimal(initial?.bedrag_inkomsten));
  const [bedragUit, setBedragUit] = useState(fmtDecimal(initial?.bedrag_uitgaven));
  const [bedragDeel, setBedragDeel] = useState(fmtDecimal(initial?.bedrag_deeluitgaven));
  const [btwIn, setBtwIn] = useState(fmtDecimal(initial?.btw_inkomsten));
  const [btwUit, setBtwUit] = useState(fmtDecimal(initial?.btw_uitgaven));
  const [btwDeel, setBtwDeel] = useState(fmtDecimal(initial?.btw_deeluitgaven));
  const [btwCodeId, setBtwCodeId] = useState<string>(
    initial?.btw_code_id ? String(initial.btw_code_id) : ""
  );

  const selectedBtw = useMemo(
    () => btwCodes.find((b) => String(b.id) === btwCodeId),
    [btwCodes, btwCodeId]
  );

  function recalcBtw() {
    if (!selectedBtw || selectedBtw.rate === null) return;
    const rate = Number(selectedBtw.rate);
    const inN = parseDecimal(bedragIn);
    const uitN = parseDecimal(bedragUit);
    const deelN = parseDecimal(bedragDeel);
    // BTW formula: BTW = bedrag * (rate / (1 + rate)), assuming the entered
    // amount is the incl-BTW total (as in the Excel data we have).
    const factor = rate / (1 + rate);
    if (inN > 0) {
      setBtwIn((inN * factor).toFixed(2).replace(".", ","));
    }
    if (uitN > 0) {
      setBtwUit((uitN * factor).toFixed(2).replace(".", ","));
    }
    if (deelN > 0) {
      setBtwDeel((deelN * factor).toFixed(2).replace(".", ","));
    }
  }

  return (
    <form action={action} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <div className="grid gap-2">
        <Label htmlFor="datum">Datum</Label>
        <Input
          id="datum"
          name="datum"
          type="date"
          defaultValue={initial?.datum ?? new Date().toISOString().slice(0, 10)}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="location_id">Locatie</Label>
        <select
          id="location_id"
          name="location_id"
          defaultValue={initial?.location_id ?? ""}
          required
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="" disabled>
            Kies een locatie…
          </option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="boekstuk">Boekstuk nr.</Label>
        <Input
          id="boekstuk"
          name="boekstuk"
          type="number"
          inputMode="numeric"
          defaultValue={initial?.boekstuk ?? ""}
          placeholder="auto"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ledger_account_id">Grootboek</Label>
        <select
          id="ledger_account_id"
          name="ledger_account_id"
          defaultValue={initial?.ledger_account_id ?? ""}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">— Geen —</option>
          {ledgerAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bedrag_inkomsten">Bedrag inkomsten (incl. BTW)</Label>
        <Input
          id="bedrag_inkomsten"
          name="bedrag_inkomsten"
          inputMode="decimal"
          value={bedragIn}
          onChange={(e) => setBedragIn(e.target.value)}
          onBlur={recalcBtw}
          placeholder="0,00"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bedrag_uitgaven">Bedrag uitgaven (incl. BTW)</Label>
        <Input
          id="bedrag_uitgaven"
          name="bedrag_uitgaven"
          inputMode="decimal"
          value={bedragUit}
          onChange={(e) => setBedragUit(e.target.value)}
          onBlur={recalcBtw}
          placeholder="0,00"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bedrag_deeluitgaven">Bedrag deeluitgaven (incl. BTW)</Label>
        <Input
          id="bedrag_deeluitgaven"
          name="bedrag_deeluitgaven"
          inputMode="decimal"
          value={bedragDeel}
          onChange={(e) => setBedragDeel(e.target.value)}
          onBlur={recalcBtw}
          placeholder="0,00"
        />
        <p className="text-xs text-muted-foreground">
          Voor uitgaven die deels privé / deels zakelijk zijn; boekhouder splitst aan jaareinde.
        </p>
      </div>

      <div className="hidden md:block" />

      <div className="grid gap-2 md:col-span-2">
        <Label htmlFor="btw_code_id">BTW Code</Label>
        <select
          id="btw_code_id"
          name="btw_code_id"
          value={btwCodeId}
          onChange={(e) => {
            setBtwCodeId(e.target.value);
          }}
          onBlur={recalcBtw}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">— Geen —</option>
          {btwCodes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          BTW-bedragen worden automatisch berekend op basis van de code, maar je
          mag ze overschrijven.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="btw_inkomsten">BTW inkomsten</Label>
        <Input
          id="btw_inkomsten"
          name="btw_inkomsten"
          inputMode="decimal"
          value={btwIn}
          onChange={(e) => setBtwIn(e.target.value)}
          placeholder="0,00"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="btw_uitgaven">BTW uitgaven</Label>
        <Input
          id="btw_uitgaven"
          name="btw_uitgaven"
          inputMode="decimal"
          value={btwUit}
          onChange={(e) => setBtwUit(e.target.value)}
          placeholder="0,00"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="btw_deeluitgaven">BTW deeluitgaven</Label>
        <Input
          id="btw_deeluitgaven"
          name="btw_deeluitgaven"
          inputMode="decimal"
          value={btwDeel}
          onChange={(e) => setBtwDeel(e.target.value)}
          placeholder="0,00"
        />
      </div>

      <div className="hidden md:block" />

      <div className="grid gap-2 md:col-span-2">
        <Label htmlFor="omschrijving">Omschrijving</Label>
        <textarea
          id="omschrijving"
          name="omschrijving"
          defaultValue={initial?.omschrijving ?? ""}
          rows={3}
          className="rounded-md border bg-background p-2 text-sm"
        />
      </div>

      <div className="md:col-span-2 flex gap-2 justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
