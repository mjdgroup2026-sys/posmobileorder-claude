"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatBaht } from "@/lib/format"

type Point = { day: string; total: number; bills: number }

export function SalesChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <p className="t-body" style={{ padding: 24 }}>
        ยังไม่มียอดขายใน 30 วันที่ผ่านมา
      </p>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.day).toLocaleDateString("th-TH", { day: "2-digit", month: "short" }),
  }))

  return (
    <div style={{ width: "100%", height: 300, padding: "16px 12px 0" }}>
      <ResponsiveContainer>
        <AreaChart data={formatted} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={70} />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--line)",
              fontSize: 13,
              background: "var(--surface)",
            }}
            formatter={(value) => [`฿${formatBaht(value)}`, "ยอดขาย"]}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="ยอดขาย"
            stroke="var(--brand)"
            strokeWidth={2}
            fill="url(#salesFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
