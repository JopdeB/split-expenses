"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function YearFilter({
  years,
  paramName = "jaar",
}: {
  years: number[];
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  const value = params.get(paramName) ?? String(years[0] ?? new Date().getFullYear());

  return (
    <label className="flex flex-col gap-1 text-xs">
      Jaar
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set(paramName, e.target.value);
          start(() => router.replace(`${pathname}?${next.toString()}`));
        }}
        className="h-9 rounded-md border bg-background px-2 text-sm"
      >
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
