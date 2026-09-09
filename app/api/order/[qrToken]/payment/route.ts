import { NextResponse } from "next/server"
import { getCustomerPaymentStatus } from "@/lib/queries"
import { reconcileSessionPayment } from "@/lib/payment-reconcile"

/// สถานะการชำระเงินสำหรับหน้า `/order/[qrToken]/pay/promptpay` — โพลทุก 4 วินาที
///
/// ต้องตอบได้ต่อแม้ DYNAMIC QR ถูก invalidate ไปแล้วตอนปิดบิล (ดู `getCustomerPaymentStatus`)
/// มิฉะนั้นรอบโพลรอบที่ทำให้รู้ว่า "จ่ายสำเร็จ" จะกลายเป็น 404 พอดี แล้วลูกค้าค้างอยู่หน้า QR ตลอดไป
///
/// **รอบโพลนี้เป็นตัวขับให้บิลปิดเอง ไม่ใช่แค่รายงานสถานะ** — ก่อนตอบกลับจะถามธนาคารด้วยว่าเงิน
/// เข้าหรือยัง เพราะ callback ของ SCB มาไม่ถึงเราเลย (ดูเหตุผลเต็มใน `lib/payment-reconcile.ts`)
/// การถามธนาคารถูกหน่วงไว้ที่ `claimBankPollSlot()` จึงไม่ได้ยิงทุก 4 วินาทีตามรอบโพล
export async function GET(_request: Request, context: RouteContext<"/api/order/[qrToken]/payment">) {
  const { qrToken } = await context.params

  const status = await getCustomerPaymentStatus(qrToken)
  if (status.state === "UNKNOWN") {
    return NextResponse.json({ ok: false, state: "UNKNOWN" }, { status: 404 })
  }

  if (status.state === "PAID") {
    return NextResponse.json({ ok: true, status })
  }

  // ยังไม่ปิดบิล — ลองถามธนาคารเอง แล้วอ่านสถานะใหม่เฉพาะรอบที่ปิดบิลได้จริง
  //
  // ล้มเหลวตรงนี้ต้องไม่ทำให้ทั้ง endpoint พัง: ธนาคารล่ม/เน็ตสะดุดเป็นเรื่องปกติ และหน้าจอลูกค้า
  // ยังต้องเห็นยอดบิลของตัวเองได้เสมอ · รอบถัดไปอีก 4 วินาทีลองใหม่เองอยู่แล้ว
  let settled = false
  try {
    const outcome = await reconcileSessionPayment(status.sessionId)
    settled = outcome?.ok === true
  } catch (error) {
    console.error("[scb-settle] โพลถามธนาคารไม่สำเร็จ:", error)
  }

  if (!settled) {
    return NextResponse.json({ ok: true, status })
  }

  return NextResponse.json({ ok: true, status: await getCustomerPaymentStatus(qrToken) })
}
