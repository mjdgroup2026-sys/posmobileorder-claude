"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconDashboard,
  IconProduct,
  IconStockIn,
  IconStockOut,
  IconReports,
  IconUsers,
  IconSettings,
} from "@/components/icons"

const NAV = [
  { href: "/", label: "ภาพรวม", Icon: IconDashboard },
  { href: "/products", label: "สินค้า", Icon: IconProduct },
  { href: "/stock-in", label: "รับสินค้าเข้า", Icon: IconStockIn },
  { href: "/stock-out", label: "เบิกจ่ายสินค้า", Icon: IconStockOut },
  { href: "/reports", label: "รายงาน", Icon: IconReports },
  { href: "/users", label: "ผู้ใช้งาน", Icon: IconUsers },
  { href: "/settings", label: "ตั้งค่า", Icon: IconSettings },
]

export function Sidebar({ lowStockCount }: { lowStockCount: number }) {
  const pathname = usePathname()

  return (
    <aside className="sidebar">
      <Link href="/" className="row" style={{ gap: 10, padding: "4px 12px 16px" }}>
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "var(--brand)",
            color: "var(--brand-ink)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          MJD
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>Mobile Order</span>
          <span className="t-caption">ระบบหลังร้าน</span>
        </span>
      </Link>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link key={href} href={href} className="nav-item" data-active={active}>
              <Icon size={18} aria-hidden />
              <span>{label}</span>
              {href === "/products" && lowStockCount > 0 ? (
                <span className="chip chip-danger num" style={{ marginLeft: "auto", height: 22 }}>
                  {lowStockCount}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
