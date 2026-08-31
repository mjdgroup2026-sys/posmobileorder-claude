"use client"

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

type Point = { day: string; stockIn: number; stockOut: number }

export function MovementChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <p className="t-body" style={{ padding: 24 }}>
        ยังไม่มีข้อมูลการเคลื่อนไหวใน 30 วันที่ผ่านมา
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
        <BarChart data={formatted} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--line)",
              fontSize: 13,
              background: "var(--surface)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="stockIn" name="รับเข้า" fill="var(--brand)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="stockOut" name="เบิกออก" fill="var(--info)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
