import { formatBaht, formatClock } from "@/lib/format"
import { IconCheck } from "@/components/icons"
import { PAYMENT_METHOD_LABEL } from "@/lib/types"
import type { CustomerPaidBill } from "@/lib/queries"

/// ป้าย "ลูกค้าชำระเงินแล้วเมื่อกี่โมง" ที่วางไว้ **ในการ์ดของโต๊ะนั้นเอง**
///
/// จำเป็นเพราะ callback ของธนาคารปิดบิลแล้วคืนโต๊ะเป็นว่างในทรานแซคชันเดียวกัน พนักงานที่เฝ้าจอ
/// จึงเห็นแค่โต๊ะกลับเป็นว่างเฉย ๆ ไม่มีอะไรบอกว่าลูกค้าจ่ายครบแล้วหรือแค่ลุกไป
///
/// ⚠️ **ห้ามแยกไปเป็นกรอบ/section ของตัวเอง** — เคยทำแบบนั้นแล้วพนักงานงงหนักกว่าเดิม เพราะต้อง
/// เอาเลขโต๊ะในกรอบใหม่ไปไล่จับคู่กับการ์ดโต๊ะอีกที · ข้อมูลของโต๊ะไหนต้องอยู่ในกรอบของโต๊ะนั้น
/// ทรงเดียวกับแถบ "เรียกพนักงาน/ขอเช็กบิล" ที่อยู่ในการ์ดโต๊ะอยู่แล้ว
export function CustomerPaidBadge({ bill }: { bill: CustomerPaidBill }) {
  return (
    <div className="alert-banner success" style={{ padding: "8px 10px", flexDirection: "column", gap: 4 }}>
      <span className="row" style={{ gap: 6 }}>
        <IconCheck size={15} aria-hidden />
        <span className="t-small" style={{ fontWeight: 700 }}>
          ลูกค้าชำระเงินแล้วเรียบร้อย
        </span>
      </span>

      {/* เวลาที่เงินเข้าจริง — ตัวหลักที่พนักงานถามหา */}
      <span className="t-small">
        เมื่อเวลา <strong className="num">{formatClock(bill.paidAt)}</strong> น. · ฿
        <span className="num">{formatBaht(bill.total)}</span> · {PAYMENT_METHOD_LABEL[bill.paymentMethod]}
      </span>

      {/* เลขบิลไว้ให้พนักงานค้นในประวัติการขายเวลาลูกค้าขอใบเสร็จย้อนหลัง */}
      <span className="t-caption num">บิล {bill.saleNumber}</span>
    </div>
  )
}
