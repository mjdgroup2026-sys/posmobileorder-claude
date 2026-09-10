import { formatBaht, formatClock, formatNumber } from "@/lib/format"
import { LiveElapsed } from "@/components/live-elapsed"
import { IconCheck } from "@/components/icons"
import { PAYMENT_METHOD_LABEL } from "@/lib/types"
import type { CustomerPaidBill } from "@/lib/queries"

/// ป้ายบอกพนักงานว่า "ลูกค้าจ่ายเองเรียบร้อยแล้วเมื่อกี่โมง" — ใช้ทั้งบนผังโต๊ะและหน้าแจ้งเตือน
///
/// จำเป็นเพราะ callback ของธนาคารปิดบิลแล้วคืนโต๊ะเป็นว่างในทรานแซคชันเดียวกัน พนักงานที่เฝ้าจอ
/// จึงเห็นแค่โต๊ะหายไปเฉย ๆ · ป้ายนี้คำนวณสดและหายเองเมื่อพ้นช่วงเวลาที่กำหนด ไม่ต้องกดรับทราบ
///
/// จัดเป็น **การ์ดใบละโต๊ะ** ทรงเดียวกับการ์ด "รอธนาคารยืนยัน" ที่อยู่หน้าเดียวกัน — ข้อมูลของโต๊ะไหน
/// ต้องอยู่ในกรอบเดียวกันให้ครบ ไม่ใช่แถบยาวบรรทัดเดียวที่พอตัดคำแล้วอ่านไม่ออกว่าเวลาเป็นของโต๊ะไหน
export function CustomerPaidNotice({ bills }: { bills: CustomerPaidBill[] }) {
  if (bills.length === 0) return null

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 className="t-h3" style={{ color: "var(--success)" }}>
        ลูกค้าชำระเงินแล้วเรียบร้อย · <span className="num">{formatNumber(bills.length)}</span> โต๊ะ
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {bills.map((bill) => (
          <article
            key={bill.saleId}
            className="card-ui card-pad"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              // ย้อมทั้งใบเป็นสีเขียว + แถบข้างหนา ๆ ให้เห็นแต่ไกลว่า "โต๊ะนี้จ่ายแล้ว"
              // ใช้ token เท่านั้น (ห้าม hex ดิบ) จะได้ถูกต้องทั้งธีม staff และ customer
              background: "var(--success-bg)",
              borderColor: "color-mix(in srgb, var(--success) 35%, transparent)",
              borderLeft: "5px solid var(--success)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
              <span className="row" style={{ gap: 8 }}>
                <IconCheck size={19} aria-hidden style={{ color: "var(--success)" }} />
                <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>โต๊ะ {bill.tableCode}</span>
              </span>
              {/* พื้นการ์ดเป็นสีเขียวอ่อนแล้ว chip แบบปกติจะจมหายไป — กลับสีให้เป็นเขียวทึบแทน */}
              <span
                className="chip"
                style={{ background: "var(--success)", color: "var(--surface)", fontWeight: 700 }}
              >
                <span className="dot" />
                ชำระเงินแล้ว
              </span>
            </div>

            {/* หัวใจของการ์ดใบนี้ — เวลาที่เงินเข้าจริง ต้องอ่านง่ายที่สุดในกรอบ */}
            <span className="t-body" style={{ color: "var(--success)" }}>
              ชำระเงินเรียบร้อยเมื่อเวลา{" "}
              <strong className="num" style={{ fontSize: "1.15rem" }}>
                {formatClock(bill.paidAt)}
              </strong>{" "}
              น.
            </span>

            <span className="t-caption">
              <LiveElapsed since={bill.paidAt} prefix="ผ่านมาแล้ว " />
            </span>

            {/* เลขบิลไว้ให้พนักงานค้นในประวัติการขายเวลาลูกค้าขอใบเสร็จย้อนหลัง */}
            <span className="t-caption">
              บิล <span className="num">{bill.saleNumber}</span> · {PAYMENT_METHOD_LABEL[bill.paymentMethod]}
            </span>

            <span className="row" style={{ justifyContent: "space-between" }}>
              <span className="t-small">ยอดที่ชำระ</span>
              <span className="t-small num" style={{ fontWeight: 600 }}>
                ฿{formatBaht(bill.total)}
              </span>
            </span>
          </article>
        ))}
      </div>
    </section>
  )
}
