import Link from "next/link"
import {
  getDashboardStats,
  getLowStockProducts,
  getRecentTransactions,
} from "@/lib/queries"
import { formatBaht, formatDateTime, formatNumber } from "@/lib/format"
import { IconArrowIn, IconArrowOut, IconProduct, IconWallet, IconWarning } from "@/components/icons"

export const metadata = { title: "ภาพรวม — MJD Mobile Order" }

export default async function DashboardPage() {
  const [stats, lowStock, recent] = await Promise.all([
    getDashboardStats(),
    getLowStockProducts(6),
    getRecentTransactions(8),
  ])

  return (
    <>
      <div className="page-head">
        <div>
          <p className="t-eyebrow">ภาพรวม</p>
          <h1 className="t-h1">สรุปสถานะคลังสินค้า</h1>
        </div>
        <div className="row">
          <Link href="/stock-in" className="btn btn-subtle">
            <IconArrowIn size={17} aria-hidden /> รับสินค้าเข้า
          </Link>
          <Link href="/stock-out" className="btn btn-primary">
            <IconArrowOut size={17} aria-hidden /> เบิกจ่ายสินค้า
          </Link>
        </div>
      </div>

      <section
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}
      >
        <article className="stat-tile">
          <span className="row" style={{ gap: 8, color: "var(--ink-3)" }}>
            <IconProduct size={17} aria-hidden />
            <span className="t-caption">สินค้าทั้งหมด</span>
          </span>
          <strong className="t-h1 num">{formatNumber(stats.productCount)}</strong>
          <span className="t-caption">รายการในระบบ</span>
        </article>

        <article className="stat-tile">
          <span className="row" style={{ gap: 8, color: "var(--ink-3)" }}>
            <IconWallet size={17} aria-hidden />
            <span className="t-caption">มูลค่าสต็อกรวม</span>
          </span>
          <strong className="t-h1 num">฿{formatBaht(stats.stockValue)}</strong>
          <span className="t-caption">Σ (คงเหลือ × ราคาต่อหน่วย)</span>
        </article>

        <article className="stat-tile">
          <span className="row" style={{ gap: 8, color: "var(--ink-3)" }}>
            <IconWarning size={17} aria-hidden />
            <span className="t-caption">สินค้าใกล้หมด</span>
          </span>
          <strong className="t-h1 num" style={{ color: stats.lowStockCount > 0 ? "var(--danger)" : undefined }}>
            {formatNumber(stats.lowStockCount)}
          </strong>
          <span className="t-caption">คงเหลือ ≤ จุดสั่งซื้อ</span>
        </article>
      </section>

      {lowStock.length > 0 ? (
        <section className="card-ui">
          <div className="panel-head">
            <div className="row" style={{ gap: 8 }}>
              <IconWarning size={18} style={{ color: "var(--warning)" }} aria-hidden />
              <h2 className="t-h2">ต้องเติมสต็อก</h2>
            </div>
            <Link href="/stock-in" className="btn btn-subtle btn-sm">
              รับสินค้าเข้า
            </Link>
          </div>
          <ul style={{ display: "flex", flexDirection: "column" }}>
            {lowStock.map((p) => (
              <li
                key={p.id}
                className="row"
                style={{
                  justifyContent: "space-between",
                  padding: "12px 24px",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>{" "}
                  <span className="t-caption num">({p.sku})</span>
                </span>
                <span className="row" style={{ gap: 10 }}>
                  <span className="t-small num">
                    เหลือ {formatNumber(p.quantity)} / จุดสั่งซื้อ {formatNumber(p.reorderPoint)} {p.unit}
                  </span>
                  <span className={`chip ${p.quantity === 0 ? "chip-danger" : "chip-warning"}`}>
                    <span className="dot" />
                    {p.quantity === 0 ? "หมด" : "ใกล้หมด"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card-ui">
        <div className="panel-head">
          <h2 className="t-h2">รายการเคลื่อนไหวล่าสุด</h2>
          <Link href="/reports" className="btn btn-ghost btn-sm">
            ดูรายงานทั้งหมด
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="t-body" style={{ padding: "24px" }}>
            ยังไม่มีการเคลื่อนไหวสต็อก — เริ่มจากรับสินค้าเข้าหรือเบิกจ่ายได้เลย
          </p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column" }}>
            {recent.map((t) => (
              <li
                key={t.id}
                className="row"
                style={{
                  justifyContent: "space-between",
                  padding: "12px 24px",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span className="row" style={{ gap: 10 }}>
                  <span className={`chip ${t.type === "IN" ? "chip-success" : "chip-info"}`}>
                    <span className="dot" />
                    {t.type === "IN" ? "รับเข้า" : "เบิกออก"}
                  </span>
                  <span>
                    <span style={{ fontWeight: 500 }}>{t.productName}</span>{" "}
                    <span className="t-caption num">({t.productSku})</span>
                    {t.note ? <span className="t-caption"> · {t.note}</span> : null}
                  </span>
                </span>
                <span className="row" style={{ gap: 14 }}>
                  <span className="t-small num" style={{ fontWeight: 600 }}>
                    {t.type === "IN" ? "+" : "−"}
                    {formatNumber(t.quantity)} {t.unit}
                  </span>
                  <span className="t-caption num">{formatDateTime(t.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
