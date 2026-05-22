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

type Props = {
  data: Array<{
    kwartaal: string;
    inkomsten: number;
    uitgaven: number;
    deeluitgaven: number;
  }>;
};

export function InkomstenUitgavenChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
        <XAxis dataKey="kwartaal" tick={{ fontSize: 12 }} />
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
        <Bar dataKey="inkomsten" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="uitgaven" fill="#ef4444" radius={[3, 3, 0, 0]} />
        <Bar dataKey="deeluitgaven" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
