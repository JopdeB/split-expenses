"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatEuro } from "@/lib/format";

type Props = {
  data: Array<{ ledger: string; uitgaven: number }>;
};

export function TopCategorienChart({ data }: Props) {
  const height = Math.max(220, data.length * 28 + 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => (typeof v === "number" && v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <YAxis
          type="category"
          dataKey="ledger"
          width={170}
          tick={{ fontSize: 11 }}
          interval={0}
        />
        <Tooltip
          formatter={(value) => formatEuro(Number(value))}
          labelStyle={{ color: "#111" }}
          contentStyle={{ borderRadius: 6, fontSize: 12 }}
        />
        <Bar dataKey="uitgaven" fill="#475569" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
