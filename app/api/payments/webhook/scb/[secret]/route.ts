import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { findIntentByRef1 } from "@/lib/payment-intent"
import { verifyAndSettleIntent } from "@/lib/payment-reconcile"
import { confirmationResponse } from "@/lib/payment-provider/scb"
import { scbPaymentConfirmationSchema } from "@/lib/validation"

/// ปลายทาง payment confirmation ของ SCB (Phase 10)
///
/// ลงทะเบียน URL นี้ในพอร์ทัล SCB ที่ Merchant Profile — ผูกเป็นคู่ (Biller ID, ref3 prefix)
///   https://<โดเมน>/api/payments/webhook/scb/<SCB_WEBHOOK_SECRET>
///
/// ⚠️ **SCB ไม่แนบ signature, API key หรือ credential ใด ๆ มากับ callback เลย** (ยืนยันจากเอกสาร
/// qr-payment/payment-confirmation) แปลว่าใครก็ตามที่เดา URL ถูกก็ POST ปลอมมาปิดบิลได้ฟรี
/// จึงกัน 3 ชั้น และ **ชั้นที่เชื่อถือได้จริงคือชั้นที่ 2** ไม่ใช่ชั้นแรก:
///   1. path ลับที่เดาไม่ได้ (กันคนยิงมั่ว ไม่ใช่กันคนที่รู้ URL)
///   2. ถามกลับไปที่ธนาคารว่ารายการนี้มีจริง (inquireBillPayment) ← ด่านจริง
///   3. เทียบยอดกับที่บันทึกไว้ตอนออก QR — ไม่ตรงห้ามปิดบิลเอง ให้พนักงานตรวจ
///
/// ต้องตอบกลับด้วยรูปแบบของ SCB เสมอ ({resCode:"00",...}) ตอบผิดรูป = ธนาคารถือว่าล้มเหลว
/// แล้วยิงซ้ำ 3 ครั้ง ห่างกัน 12 วินาที ก่อนเลิกแล้วส่งรายละเอียดไปทางอีเมลแทน

/// บันทึกทุกเส้นทางของ callback ลง log ของแอป
///
/// ของเดิม route นี้เงียบสนิททุกกรณีที่ปฏิเสธ เวลาไล่ปัญหาจึงแยกไม่ออกว่า "ธนาคารไม่เคยยิงมา"
/// หรือ "ยิงมาแล้วแต่ตกด่านใดด่านหนึ่ง" ต้องไปอ่าน nginx access log ซึ่งต้องใช้สิทธิ์ root ทุกครั้ง
/// (เจอจริงตอนไล่เคส 2026-09-08 ที่จ่ายเงินสำเร็จ 3 รอบแล้วบิลไม่ปิด)
///
/// ⚠️ ห้าม log ค่า secret ที่รับเข้ามา และห้าม log payload ทั้งก้อน — ใน payload ของ SCB
/// มีชื่อและเลขบัญชีผู้จ่าย (`payerName`, `payerAccountNumber`) ซึ่งไม่ควรตกไปอยู่ใน log
function log(message: string, detail?: Record<string, unknown>) {
  console.info(`[scb-webhook] ${message}`, detail ? JSON.stringify(detail) : "")
}

/// รูปแบบที่ตอบเมื่อ "ยังปิดบิลให้ไม่ได้" — resCode ไม่ใช่ 00 ธนาคารจะยิงซ้ำตามรอบของมัน
function failureResponse(reason: string) {
  log("ปฏิเสธ ตอบ resCode 99", { reason })
  return NextResponse.json({ resCode: "99", resDesc: reason }, { status: 200 })
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/// ธนาคารบังคับให้ inquiry ระบุ transactionDate เป็น yyyy-MM-dd ตามโซนเวลาไทย
/// callback ส่ง transactionDateandTime มาในรูป yyyy-MM-ddThh:mm:ss.sss±hh:mm อยู่แล้ว
/// ถ้าไม่มีค่ามาให้ ค่อยถอยไปใช้วันที่ปัจจุบันฝั่งไทย (อย่าใช้เวลาเครื่อง server ตรง ๆ)
function toBangkokDate(raw?: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

export async function POST(request: NextRequest, context: RouteContext<"/api/payments/webhook/scb/[secret]">) {
  // บรรทัดแรกสุด — มีคำขอเข้ามาถึงตัว route จริงหรือไม่ คือคำถามแรกที่ต้องตอบได้เสมอ
  log("มีคำขอเข้ามา", {
    userAgent: request.headers.get("user-agent") ?? "-",
    contentLength: request.headers.get("content-length") ?? "-",
  })

  const expected = process.env.SCB_WEBHOOK_SECRET
  if (!expected) {
    // ไม่ตั้ง secret = ยังไม่เปิดใช้เส้นทางอัตโนมัติ — ปฏิเสธไว้ก่อน ดีกว่าเปิดรับใครก็ได้
    log("ตอบ 503 — ยังไม่ได้ตั้ง SCB_WEBHOOK_SECRET")
    return NextResponse.json({ resCode: "99", resDesc: "webhook ยังไม่ถูกเปิดใช้งาน" }, { status: 503 })
  }

  const { secret } = await context.params
  if (!secretMatches(secret, expected)) {
    // ห้าม log ค่าที่รับมา — log แค่ความยาวไว้ไล่เคส URL ถูกตัดสั้นระหว่างทาง
    log("ตอบ 401 — secret ไม่ตรง", { receivedLength: secret.length, expectedLength: expected.length })
    return NextResponse.json({ resCode: "99", resDesc: "unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return failureResponse("payload ไม่ใช่ JSON")
  }

  const parsed = scbPaymentConfirmationSchema.safeParse(body)
  if (!parsed.success) {
    // log เฉพาะ "ชื่อฟิลด์ที่ส่งมา" ไม่ใช่ค่า — พอให้รู้ว่าธนาคารส่งโครงสร้างแบบไหนมาโดยไม่แตะข้อมูลผู้จ่าย
    log("payload ไม่ผ่าน schema", {
      keys: body && typeof body === "object" ? Object.keys(body) : typeof body,
      issue: parsed.error.issues[0]?.message ?? "-",
    })
    return failureResponse(parsed.error.issues[0]?.message ?? "payload ไม่ถูกต้อง")
  }

  // ตั้งใจไม่ดึง `amount` ออกมาใช้ — schema บังคับให้ต้องมีในคำขอ แต่ยอดที่เอาไปตัดสินใจจริง
  // ต้องเป็นยอดที่ธนาคารยืนยันกลับมาเท่านั้น ยอดใน payload ปลอมได้ (callback ไม่มีลายเซ็น)
  const { transactionId, billPaymentRef1, transactionDateandTime } = parsed.data

  log("payload ผ่านการตรวจแล้ว", { transactionId, billPaymentRef1, transactionDateandTime })

  // ★ กัน callback ซ้ำก่อนทุกอย่าง — ธนาคารยิงซ้ำ *หลัง* บิลถูกปิดไปแล้วได้ ซึ่งตอนนั้นไม่มี
  //   session ที่เปิดอยู่ให้หาเจออีก ถ้าไปหา session ก่อนจะตอบล้มเหลวแล้วธนาคาร retry ไม่จบ
  const settled = await prisma.sale.findUnique({
    where: { paymentReference: transactionId },
    select: { id: true, saleNumber: true },
  })
  if (settled) {
    log("callback ซ้ำ — บิลนี้ปิดไปแล้ว ตอบสำเร็จซ้ำ", { saleNumber: settled.saleNumber })
    return NextResponse.json(confirmationResponse(transactionId, settled.saleNumber))
  }

  const intent = await findIntentByRef1(billPaymentRef1)
  if (!intent) {
    return failureResponse("ไม่พบรายการที่ตรงกับเลขอ้างอิงนี้")
  }

  // ★ ด่านตรวจทั้งหมด (ถามธนาคาร → เทียบยอด → ปิดบิล) อยู่ใน `verifyAndSettleIntent` ซึ่งใช้
  //   ร่วมกับเส้นทางโพลของลูกค้า — ห้ามตรวจซ้ำเองตรงนี้ ไม่งั้นสองทางจะค่อย ๆ เพี้ยนออกจากกัน
  const outcome = await verifyAndSettleIntent(intent, [toBangkokDate(transactionDateandTime)])
  if (!outcome.ok) {
    return failureResponse(outcome.reason)
  }

  return NextResponse.json(confirmationResponse(outcome.transactionId, outcome.saleNumber))
}
