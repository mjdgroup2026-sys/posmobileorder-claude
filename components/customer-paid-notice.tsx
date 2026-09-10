import { formatBaht, formatClock, formatNumber } from "@/lib/format"
import { LiveElapsed } from "@/components/live-elapsed"
import { IconCheck } from "@/components/icons"
import { PAYMENT_METHOD_LABEL } from "@/lib/types"
import type { CustomerPaidBill } from "@/lib/queries"

/// ป้ายบอกพนักงานว่า "ลูกค้าจ่ายเองเรียบร้อยแล้วเมื่อกี่โมง" — ใช้ทั้งบนผังโต๊ะและหน้าแจ้งเตือน
///
/// จำเป็นเพราะ callback ของธนาคารปิดบิลแล้วคืนโต๊ะเป็นว่างในทรานแซคชันเดียวกัน พนักงานที่เฝ้าจอ
/// จึงเห็นแค่โต๊ะหายไปเฉย ๆ · ป้ายนี้คำนวณสดและหายเองเมื่อพ้นช่วงเวลาที่กำหนด ไม่ต้องกดรับทราบ
export function CustomerPaidNotice({ bills }: { bills: CustomerPaidBill[] }) {
  if (bills.length === 0) return null

  return (
    <section className="alert-banner success" style={{ flexDirection: "column", gap: 8 }}>
      <span className="row" style={{ gap: 8 }}>
        <IconCheck size={18} aria-hidden />
        <strong>
          ลูกค้าชำระเงินแล้วเรียบร้อย · <span className="num">{formatNumber(bills.length)}</span> โต๊ะ
        </strong>
      </span>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {bills.map((bill) => (
          <li key={bill.saleId} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <strong>โต๊ะ {bill.tableCode}</strong>
            <span>
              ชำระเงินเรียบร้อยเมื่อเวลา <span className="num">{formatClock(bill.paidAt)}</span> น.
            </span>
            <LiveElapsed since={bill.paidAt} prefix="· ผ่านมาแล้ว " />
            <span className="num">· ฿{formatBaht(bill.total)}</span>
            <span>· {PAYMENT_METHOD_LABEL[bill.paymentMethod]}</span>
            {/* เลขบิลไว้ให้พนักงานค้นในประวัติการขายเวลาลูกค้าขอใบเสร็จย้อนหลัง */}
            <span className="num">· บิล {bill.saleNumber}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
