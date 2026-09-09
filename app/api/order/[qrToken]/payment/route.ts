import { NextResponse } from "next/server"
import { getCustomerPaymentStatus } from "@/lib/queries"

/// สถานะการชำระเงินสำหรับหน้า `/order/[qrToken]/pay/promptpay` — โพลทุก 4 วินาที
///
/// ต้องตอบได้ต่อแม้ DYNAMIC QR ถูก invalidate ไปแล้วตอนปิดบิล (ดู `getCustomerPaymentStatus`)
/// มิฉะนั้นรอบโพลรอบที่ทำให้รู้ว่า "จ่ายสำเร็จ" จะกลายเป็น 404 พอดี แล้วลูกค้าค้างอยู่หน้า QR ตลอดไป
///
/// ⚠️ **endpoint นี้รายงานสถานะอย่างเดียว ห้ามปิดบิลเอง** — เคยมีเวอร์ชันที่ถาม
/// `inquireBillPayment` ตรงนี้แล้วปิดบิลให้เมื่อเจอเงิน (ตอน callback ของ SCB ยังมาไม่ถึง)
/// แล้วถอดออกตามการตัดสินใจ 2026-09-09: เงินเข้าต้องถูกยืนยันด้วย callback ของธนาคารเท่านั้น
/// ไม่ให้แอปตัดสินใจปิดบิลเอง · ที่นี่จึงอ่านอย่างเดียว ไม่ยิงออกไปหาธนาคาร
export async function GET(_request: Request, context: RouteContext<"/api/order/[qrToken]/payment">) {
  const { qrToken } = await context.params

  const status = await getCustomerPaymentStatus(qrToken)
  if (status.state === "UNKNOWN") {
    return NextResponse.json({ ok: false, state: "UNKNOWN" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, status })
}
