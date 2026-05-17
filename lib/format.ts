const nlNumber = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nlDate = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatEuro(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return "—";
  if (num === 0) return "—";
  return "€ " + nlNumber.format(num);
}

export function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return "—";
  if (num === 0) return "—";
  return nlNumber.format(num);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return nlDate.format(date);
}

export function quarterFromDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q}`;
}

export function yearFromDate(d: string | Date): number {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.getFullYear();
}
