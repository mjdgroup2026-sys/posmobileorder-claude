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
  IconPos,
  IconReceipt,
  IconCalculator,
  IconCategory,
  IconTable,
  IconBell,
  IconKitchen,
  IconQr,
  IconStore,
} from "@/components/icons"

type NavItem = { href: string; label: string; Icon: typeof IconDashboard; badge?: "lowStock" | "pending" }

const GROUPS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "ภาพรวม", Icon: IconDashboard },
      { href: "/pos", label: "ขายหน้าร้าน (POS)", Icon: IconPos },
      { href: "/pos/history", label: "ประวัติการขาย", Icon: IconReceipt },
      { href: "/pos/closing", label: "ปิดยอดประจำวัน", Icon: IconCalculator },
    ],
  },
  {
    title: "MJD Mobile Order",
    items: [
      { href: "/mobile-order/tables", label: "ผังโต๊ะ", Icon: IconTable },
      { href: "/mobile-order/notifications", label: "การแจ้งเตือน", Icon: IconBell, badge: "pending" },
      { href: "/mobile-order/kitchen", label: "หน้าจอครัว (KDS)", Icon: IconKitchen },
      { href: "/mobile-order/qr-codes", label: "จัดการ QR Code", Icon: IconQr },
      { href: "/mobile-order/settings", label: "ตั้งค่าร้าน", Icon: IconStore },
    ],
  },
  {
    title: "คลังสินค้า",
    items: [
      { href: "/products", label: "สินค้า", Icon: IconProduct, badge: "lowStock" },
      { href: "/categories", label: "หมวดหมู่สินค้า", Icon: IconCategory },
      { href: "/stock-in", label: "รับสินค้าเข้า", Icon: IconStockIn },
      { href: "/stock-out", label: "เบิกจ่ายสินค้า", Icon: IconStockOut },
      { href: "/reports", label: "รายงาน", Icon: IconReports },
    ],
  },
  {
    items: [
      { href: "/users", label: "ผู้ใช้งาน", Icon: IconUsers },
      { href: "/settings", label: "ตั้งค่า", Icon: IconSettings },
    ],
  },
]

/// href ที่มีเส้นทางลูก (เช่น /pos กับ /pos/history) ต้องเทียบแบบตรงตัว
/// ไม่งั้นเมนูแม่จะสว่างค้างตอนอยู่หน้าลูก
const EXACT_MATCH = new Set(["/", "/pos"])

export function Sidebar({
  lowStockCount,
  pendingNotificationCount = 0,
}: {
  lowStockCount: number
  pendingNotificationCount?: number
}) {
  const pathname = usePathname()

  function badgeCount(item: NavItem): number {
    if (item.badge === "lowStock") return lowStockCount
    if (item.badge === "pending") return pendingNotificationCount
    return 0
  }

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

      <nav style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {GROUPS.map((group, index) => (
          <div key={group.title ?? `group-${index}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {group.title ? (
              <span className="t-eyebrow" style={{ padding: "4px 12px" }}>
                {group.title}
              </span>
            ) : null}

            {group.items.map(({ href, label, Icon, badge }) => {
              const active = EXACT_MATCH.has(href) ? pathname === href : pathname.startsWith(href)
              const count = badgeCount({ href, label, Icon, badge })
              return (
                <Link key={href} href={href} className="nav-item" data-active={active}>
                  <Icon size={18} aria-hidden />
                  <span>{label}</span>
                  {count > 0 ? (
                    <span
                      className={`chip ${badge === "pending" ? "chip-danger" : "chip-danger"} num`}
                      style={{ marginLeft: "auto", height: 22 }}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
