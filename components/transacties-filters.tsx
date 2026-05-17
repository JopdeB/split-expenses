"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import type { Location } from "@/lib/types";

type Props = {
  locations: Location[];
  years: number[];
};

export function TransactiesFilters({ locations, years }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "" || value === "all") next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  const year = params.get("jaar") ?? "all";
  const locId = params.get("location") ?? "all";
  const q = params.get("q") ?? "";

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className="flex flex-col gap-1 text-xs">
        Jaar
        <select
          value={year}
          onChange={(e) => setParam("jaar", e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="all">Alle</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        Locatie
        <select
          value={locId}
          onChange={(e) => setParam("location", e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="all">Alle</option>
          {locations.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs flex-1 min-w-[180px]">
        Zoek
        <input
          type="search"
          defaultValue={q}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="omschrijving…"
          className="h-9 rounded-md border bg-background px-2 text-sm"
        />
      </label>
    </div>
  );
}
