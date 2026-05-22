"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatEuro } from "@/lib/format";

const COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899"];

type Props = {
  data: Array<Record<string, number | string>>;
  locationNames: string[];
};

export function UitgavenPerMaandChart({ data, locationNames }: Props) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
        <XAxis dataKey="maand" tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => (typeof v === "number" && v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          width={45}
        />
        <Tooltip
          formatter={(value) => formatEuro(Number(value))}
          labelStyle={{ color: "#111" }}
          contentStyle={{ borderRadius: 6, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {locationNames.map((name, i) => (
          <Bar key={name} dataKey={name} stackId="uitgaven" fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
