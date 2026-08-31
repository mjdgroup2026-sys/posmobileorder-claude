import { getMovementReport, getTopMovedProducts, listTransactions } from "@/lib/queries"
import { MovementChart } from "@/components/movement-chart"
import { formatDateTime, formatNumber } from "@/lib/format"

export const metadata = { title: "รายงาน" }

export default async function ReportsPage() {
  const [movement, topProducts, transactions] = await Promise.all([
    getMovementReport(),
    getTopMovedProducts(5),
    listTransactions(20),
  ])

  const totalIn = movement.reduce((sum, d) => sum + d.stockIn, 0)
  const totalOut = movement.reduce((sum, d) => sum + d.stockOut, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <p className="t-eyebrow">รายงาน</p>
          <h1 className="t-h1">สรุปการเคลื่อนไหว 30 วัน</h1>
        </div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <article className="stat-tile">
          <span className="t-caption">รับเข้ารวม 30 วัน</span>
          <strong className="t-h1 num" style={{ color: "var(--success)" }}>
            +{formatNumber(totalIn)}
          </strong>
        </article>
        <article className="stat-tile">
          <span className="t-caption">เบิกออกรวม 30 วัน</span>
          <strong className="t-h1 num" style={{ color: "var(--info)" }}>
            −{formatNumber(totalOut)}
          </strong>
        </article>
        <article className="stat-tile">
          <span className="t-caption">สุทธิ</span>
          <strong className="t-h1 num">{formatNumber(totalIn - totalOut)}</strong>
        </article>
      </section>

      <section className="card-ui">
        <div className="panel-head">
          <h2 className="t-h2">กราฟการเคลื่อนไหวรายวัน</h2>
        </div>
        <MovementChart data={movement} />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <section className="card-ui">
          <div className="panel-head">
            <h2 className="t-h2">สินค้าเบิกออกมากที่สุด</h2>
          </div>
          {topProducts.length === 0 ? (
            <p className="t-body" style={{ padding: 24 }}>
              ยังไม่มีข้อมูลการเบิกจ่าย
            </p>
          ) : (
            <ol style={{ display: "flex", flexDirection: "column" }}>
              {topProducts.map((p, index) => (
                <li
                  key={p.sku}
                  className="row"
                  style={{ justifyContent: "space-between", padding: "12px 24px", borderTop: "1px solid var(--line)" }}
                >
                  <span className="row" style={{ gap: 10 }}>
                    <span className="chip chip-brand num">{index + 1}</span>
                    <span>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>{" "}
                      <span className="t-caption num">({p.sku})</span>
                    </span>
                  </span>
                  <span className="t-small num" style={{ fontWeight: 600 }}>
                    {formatNumber(p.total)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card-ui">
          <div className="panel-head">
            <h2 className="t-h2">รายการล่าสุด</h2>
          </div>
          {transactions.length === 0 ? (
            <p className="t-body" style={{ padding: 24 }}>
              ยังไม่มีรายการเคลื่อนไหว
            </p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", maxHeight: 380, overflowY: "auto" }}>
              {transactions.map((t) => (
                <li
                  key={t.id}
                  className="row"
                  style={{ justifyContent: "space-between", padding: "10px 24px", borderTop: "1px solid var(--line)" }}
                >
                  <span className="row" style={{ gap: 8 }}>
                    <span className={`chip ${t.type === "IN" ? "chip-success" : "chip-info"}`}>
                      <span className="dot" />
                      {t.type === "IN" ? "เข้า" : "ออก"}
                    </span>
                    <span className="t-small">{t.productName}</span>
                  </span>
                  <span className="row" style={{ gap: 12 }}>
                    <span className="t-small num">
                      {t.type === "IN" ? "+" : "−"}
                      {formatNumber(t.quantity)}
                    </span>
                    <span className="t-caption num">{formatDateTime(t.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
