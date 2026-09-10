import { formatBaht, formatClock } from "@/lib/format"
import { LiveElapsed } from "@/components/live-elapsed"
import { IconCheck, IconWarning } from "@/components/icons"
import { PAYMENT_METHOD_LABEL } from "@/lib/types"
import type { CustomerPaidBill, PaymentAwaitingCallback } from "@/lib/queries"

/// แถบสถานะการชำระเงินที่วางไว้ **ในกรอบของโต๊ะนั้นเอง** — ทั้งผังโต๊ะและการ์ดแจ้งเตือน
///
/// ⚠️ **ห้ามแยกไปเป็นกรอบ/section ของตัวเอง** — เคยทำแบบนั้นแล้วพนักงานงงหนักกว่าเดิม เพราะต้อง
/// เอาเลขโต๊ะในกรอบใหม่ไปไล่จับคู่กับการ์ดโต๊ะอีกที · ข้อมูลของโต๊ะไหนต้องอยู่ในกรอบของโต๊ะนั้น
/// ทรงเดียวกับแถบ "เรียกพนักงาน/ขอเช็กบิล" ที่อยู่ในการ์ดโต๊ะอยู่แล้ว

const INSET: React.CSSProperties = { padding: "8px 10px", flexDirection: "column", gap: 4 }

/// โต๊ะที่ปิดบิลไปแล้ว — โต๊ะกลับเป็นว่างในทรานแซคชันเดียวกับที่ปิดบิล
/// ถ้าไม่มีแถบนี้พนักงานจะเห็นแค่โต๊ะหายไปเฉย ๆ ไม่รู้ว่าจ่ายครบแล้วหรือแค่ลุกไป
///
/// ขึ้นทั้งบิลที่ระบบปิดเองหลังธนาคารยืนยัน และบิลที่พนักงานกดปิดเอง — บอกให้ชัดว่าใครปิด
/// (เคสจ่ายหลัง QR หมดอายุมักจบด้วยพนักงานกดปิดเอง ถ้ากรองออกจะไม่มีอะไรขึ้นบนจอเลย)
export function CustomerPaidBadge({ bill }: { bill: CustomerPaidBill }) {
  return (
    <div className="alert-banner success" style={INSET}>
      <span className="row" style={{ gap: 6 }}>
        <IconCheck size={15} aria-hidden />
        <span className="t-small" style={{ fontWeight: 700 }}>
          {bill.autoClosed ? "ลูกค้าชำระเงินแล้วเรียบร้อย" : "ปิดบิลเรียบร้อยแล้ว"}
        </span>
      </span>

      {/* เวลาที่เงินเข้าจริง — ตัวหลักที่พนักงานถามหา */}
      <span className="t-small">
        เมื่อเวลา <strong className="num">{formatClock(bill.paidAt)}</strong> น. · ฿
        <span className="num">{formatBaht(bill.total)}</span> · {PAYMENT_METHOD_LABEL[bill.paymentMethod]}
      </span>

      {/* เลขบิลไว้ให้พนักงานค้นในประวัติการขายเวลาลูกค้าขอใบเสร็จย้อนหลัง */}
      <span className="t-caption">
        <span className="num">บิล {bill.saleNumber}</span> ·{" "}
        {bill.autoClosed
          ? "ระบบปิดบิลอัตโนมัติหลังธนาคารยืนยัน"
          : `ปิดโดย ${bill.closedByName ?? "พนักงาน"}`}
      </span>
    </div>
  )
}

/// ออก QR ให้ลูกค้าไปแล้วเกิน 5 นาทีแต่ธนาคารยังไม่ยืนยัน
///
/// **แค่เตือน ระบบไม่ปิดบิลให้เองและไม่ยิงถามธนาคาร** (ตัดสินใจ 2026-09-09 ว่าเงินเข้าต้องยืนยัน
/// ด้วย callback ของธนาคารเท่านั้น) — คนที่ตัดสินว่าเงินเข้าจริงหรือไม่คือพนักงาน `ref1` จึงต้อง
/// แสดงไว้ให้เอาไปค้นในแอปธนาคารได้ทันที
export function AwaitingCallbackBadge({ item }: { item: PaymentAwaitingCallback }) {
  return (
    <div className="alert-banner warning" style={INSET}>
      <span className="row" style={{ gap: 6 }}>
        <IconWarning size={15} aria-hidden />
        <span className="t-small" style={{ fontWeight: 700 }}>
          รอธนาคารยืนยันนานผิดปกติ
        </span>
      </span>

      <span className="t-small">
        ออก QR เมื่อ <strong className="num">{formatClock(item.issuedAt)}</strong> น. ·{" "}
        <LiveElapsed since={item.issuedAt} prefix="รอมาแล้ว " /> · ฿
        <span className="num">{formatBaht(item.amount)}</span>
      </span>

      <span className="t-caption">
        เลขอ้างอิง <span className="num">{item.ref1}</span> — ตรวจกับแอปธนาคารก่อนปิดบิล
      </span>
    </div>
  )
}
