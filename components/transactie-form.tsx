"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BtwCode, LedgerAccount, Location, Transaction } from "@/lib/types";
import type { NextBoekstukMap } from "@/lib/next-boekstuk";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  locations: Location[];
  ledgerAccounts: LedgerAccount[];
  btwCodes: BtwCode[];
  nextBoekstukMap: NextBoekstukMap;
  initial?: Partial<Transaction> | null;
  submitLabel: string;
};

function fmtDecimal(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num) || num === 0) return "";
  return num.toString().replace(".", ",");
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
  nextBoekstukMap,
  initial,
  submitLabel,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [datum, setDatum] = useState<string>(initial?.datum ?? today);
  const [locationId, setLocationId] = useState<string>(
    initial?.locationId ? String(initial.locationId) : "",
  );
  const [boekstuk, setBoekstuk] = useState<string>(
    initial?.boekstuk ? String(initial.boekstuk) : "",
  );
  const [bedragIn, setBedragIn] = useState(fmtDecimal(initial?.bedragInkomsten));
  const [bedragUit, setBedragUit] = useState(fmtDecimal(initial?.bedragUitgaven));
  const [bedragDeel, setBedragDeel] = useState(fmtDecimal(initial?.bedragDeeluitgaven));
  const [btwIn, setBtwIn] = useState(fmtDecimal(initial?.btwInkomsten));
  const [btwUit, setBtwUit] = useState(fmtDecimal(initial?.btwUitgaven));
  const [btwDeel, setBtwDeel] = useState(fmtDecimal(initial?.btwDeeluitgaven));
  const [btwCodeId, setBtwCodeId] = useState<string>(
    initial?.btwCodeId ? String(initial.btwCodeId) : ""
  );

  const suggestedBoekstuk = useMemo(() => {
    const locId = parseInt(locationId, 10);
    if (!Number.isFinite(locId) || !datum) return null;
    const year = parseInt(datum.slice(0, 4), 10);
    if (!Number.isFinite(year)) return null;
    const fromMap = nextBoekstukMap[locId]?.[year];
    return typeof fromMap === "number" ? fromMap : 1;
  }, [locationId, datum, nextBoekstukMap]);

  const selectedLocationName = useMemo(() => {
    const locId = parseInt(locationId, 10);
    return locations.find((l) => l.id === locId)?.name ?? null;
  }, [locationId, locations]);

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
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="location_id">Locatie</Label>
        <select
          id="location_id"
          name="location_id"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          required
          className="h-11 md:h-9 rounded-md border bg-background px-2 text-base md:text-sm"
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
          value={boekstuk}
          onChange={(e) => setBoekstuk(e.target.value)}
          placeholder={suggestedBoekstuk !== null ? String(suggestedBoekstuk) : "auto"}
        />
        {suggestedBoekstuk !== null && boekstuk === "" && (
          <p className="text-xs text-muted-foreground">
            Leeg laten → automatisch nr.{" "}
            <span className="font-medium text-foreground">{suggestedBoekstuk}</span>
            {selectedLocationName && datum && (
              <>
                {" "}voor {selectedLocationName} {datum.slice(0, 4)}
              </>
            )}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ledger_account_id">Grootboek</Label>
        <select
          id="ledger_account_id"
          name="ledger_account_id"
          defaultValue={initial?.ledgerAccountId ?? ""}
          className="h-11 md:h-9 rounded-md border bg-background px-2 text-base md:text-sm"
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
          className="h-11 md:h-9 rounded-md border bg-background px-2 text-base md:text-sm"
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

      {/* Desktop submit (inline at end of form) */}
      <div className="hidden md:flex md:col-span-2 gap-2 justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>

      {/* Mobile submit: sticky bar above the bottom-nav so the button is
          always reachable, even on long forms */}
      <div
        className="md:hidden fixed left-0 right-0 bottom-14 z-30 border-t bg-background/95 backdrop-blur p-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <Button type="submit" className="w-full h-12 text-base">
          {submitLabel}
        </Button>
      </div>

      {/* Spacer so the last form field isn't hidden behind the sticky bar */}
      <div className="md:hidden h-20" aria-hidden />
    </form>
  );
}
