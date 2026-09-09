import "server-only"
import { prisma } from "@/lib/prisma"
import { closeSessionWithPayment } from "@/lib/close-session"
import {
  claimBankPollSlot,
  findPendingIntentBySession,
  markIntentFailed,
  markIntentPaid,
  type IntentLookup,
} from "@/lib/payment-intent"
import { inquireBillPayment, isScbConfigured } from "@/lib/payment-provider/scb"

/// ตรวจกับธนาคารแล้วปิดบิล — แกนกลางที่ **ทั้ง callback ของ SCB และการโพลของลูกค้าใช้ร่วมกัน**
///
/// ทำไมต้องมีเส้นทางโพลทั้งที่มี callback อยู่แล้ว: SCB ส่ง payment confirmation ให้เฉพาะเมื่อ URL
/// ถูกลงทะเบียนในพอร์ทัลไว้กับคู่ (Biller ID, ref3 prefix) ที่ถูกต้อง — ตั้งผิด ไม่ได้ตั้ง หรืออยู่บน
/// sandbox ก็เงียบสนิทโดยไม่มีสัญญาณใด ๆ · ตรวจจริงเมื่อ 2026-09-09: ลูกค้าจ่ายสำเร็จ แต่ route
/// ของ callback ไม่มีคำขอเข้ามาเลยสักครั้งใน 23 ชั่วโมง · เส้นทางโพลจึงเป็นตัวที่ทำให้บิลปิดเองได้จริง
/// ส่วน callback กลายเป็นทางลัดที่เร็วกว่าเมื่อธนาคารยิงมาให้
///
/// ⚠️ ทั้งสองทางต้องผ่านด่านเดียวกันเป๊ะ ๆ ห้ามแยกโค้ดกัน มิฉะนั้นทางใดทางหนึ่งจะปิดบิลด้วย
/// เงื่อนไขที่หลวมกว่าอีกทางโดยไม่มีใครรู้ — ด่านทั้งสามคือ ①ธนาคารยืนยันว่ารายการมีจริง
/// ②ยอดตรงกับที่ล็อกไว้ตอนออก QR ③ยอดยังพอกับบิลปัจจุบัน (ตรวจใน closeSessionWithPayment)

export type SettleResult =
  | { ok: true; saleNumber: string; transactionId: string }
  | { ok: false; reason: string }

function log(message: string, detail?: Record<string, unknown>) {
  console.info(`[scb-settle] ${message}`, detail ? JSON.stringify(detail) : "")
}

function bangkokDate(at: Date): string {
  return at.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

/// วันที่ที่ต้องถามธนาคาร — inquiry ถามได้ทีละวัน และรายการอยู่ในวันที่ "เงินเข้า" ตามเวลาไทย
///
/// ปกติคือวันนี้ แต่ถ้า QR ถูกออกก่อนเที่ยงคืนแล้วลูกค้าจ่ายหลังเที่ยงคืน สองวันนี้จะคนละวัน
/// ต้องถามทั้งคู่ ไม่งั้นบิลที่คร่อมเที่ยงคืนจะไม่มีวันปิดเอง (ร้านอาหารปิดดึกเจอแน่)
function datesToInquire(intent: IntentLookup): string[] {
  const today = bangkokDate(new Date())
  const issued = bangkokDate(intent.createdAt)
  return today === issued ? [today] : [today, issued]
}

/// ยกเคสให้พนักงานตัดสิน แล้วหยุดพยายามปิดบิลเอง
///
/// สร้าง Notification เฉพาะ "ครั้งที่ปิดใบได้จริง" เท่านั้น — เคสเดียวกันถูกตรวจเจอซ้ำได้หลายรอบ
/// (ธนาคาร retry callback 3 ครั้ง + ลูกค้าโพลทุก 10 วินาที) ถ้าแจ้งทุกรอบพนักงานจะได้ใบซ้ำเป็นสิบ
async function handOffToStaff(intent: IntentLookup, reason: string): Promise<void> {
  if (!(await markIntentFailed(intent.id))) return
  await prisma.notification.create({
    data: { tableSessionId: intent.tableSessionId, type: "CHECK_BILL", reason },
  })
}

/// ถามธนาคาร → เทียบยอด → ปิดบิล · ใช้กับ intent ที่รู้แล้วว่าเป็นของโต๊ะไหน
export async function verifyAndSettleIntent(
  intent: IntentLookup,
  transactionDates: string[],
): Promise<SettleResult> {
  // ★ ด่านที่ 1 — ถามธนาคารว่ารายการนี้เกิดขึ้นจริงไหม ห้ามเชื่อสิ่งที่ยิงเข้ามา
  let verified: Awaited<ReturnType<typeof inquireBillPayment>> | null = null
  let lastError = "ธนาคารไม่พบรายการชำระเงินที่ตรงกับเลขอ้างอิงนี้"

  for (const transactionDate of transactionDates) {
    const result = await inquireBillPayment({ transactionDate, ref1: intent.ref1 })
    if (result.ok) {
      verified = result
      break
    }
    lastError = result.error
  }

  if (!verified?.ok) {
    // ยังไม่ mark FAILED — ส่วนใหญ่แปลว่า "ลูกค้ายังไม่ได้จ่าย" ซึ่งเป็นเรื่องปกติของทุกรอบโพล
    // ก่อนเงินเข้า · ถ้าไปปิดใบทิ้งตรงนี้ พอเงินเข้าจริงจะไม่มีใบให้จับคู่อีกเลย
    return { ok: false, reason: lastError }
  }

  const bank = verified.data

  // ★ ด่านที่ 2 — ลูกค้าแก้จำนวนเงินในแอปธนาคารได้ ปิดบิลทั้งที่ได้เงินไม่ครบไม่ได้
  if (bank.amount !== intent.amount) {
    log("ยอดไม่ตรงกับที่ล็อกไว้ตอนออก QR", { bankAmount: bank.amount, intentAmount: intent.amount })
    await handOffToStaff(
      intent,
      `ยอดชำระไม่ตรงกับบิล — ธนาคารยืนยัน ${bank.amount.toFixed(2)} บาท ` +
        `แต่บิลคือ ${intent.amount.toFixed(2)} บาท กรุณาตรวจสอบก่อนปิดโต๊ะ`,
    )
    return { ok: false, reason: "ยอดชำระไม่ตรงกับบิล ส่งให้พนักงานตรวจสอบแล้ว" }
  }

  // ★ ด่านที่ 3 อยู่ข้างใน closeSessionWithPayment — `verifiedAmount` ทำให้มันยกเลิกทรานแซคชัน
  //   ถ้าบิลโตขึ้นระหว่างที่ลูกค้ากำลังจ่าย (คนอื่นบนโต๊ะเดียวกันสั่งเพิ่ม)
  const closed = await closeSessionWithPayment({
    sessionId: intent.tableSessionId,
    paymentMethod: "PROMPTPAY",
    paymentReference: bank.transactionId,
    amountReceived: bank.amount,
    verifiedAmount: bank.amount,
  })

  if (!closed.ok) {
    // เงินเข้าธนาคารแล้วแต่ปิดบิลไม่ได้ — ห้ามปล่อยเงียบ ไม่งั้นลูกค้าจ่ายไปแล้วแต่โต๊ะยังค้าง
    // แล้วไม่มีใครรู้เลยว่ามีเงินก้อนนี้อยู่ · ส่งต่อให้พนักงานตรวจแล้วหยุดลองใหม่
    log("ธนาคารยืนยันเงินเข้าแล้วแต่ปิดบิลไม่ได้", { reason: closed.error, transactionId: bank.transactionId })
    await handOffToStaff(
      intent,
      `ได้รับเงิน ${bank.amount.toFixed(2)} บาทแล้ว (อ้างอิง ${bank.transactionId}) ` +
        `แต่ระบบปิดบิลอัตโนมัติไม่ได้: ${closed.error} — กรุณาตรวจสอบแล้วปิดบิลด้วยตนเอง`,
    )
    return { ok: false, reason: closed.error }
  }

  await markIntentPaid(intent.id, bank.transactionId)

  log("ปิดบิลสำเร็จ", {
    saleNumber: closed.saleNumber,
    transactionId: bank.transactionId,
    amount: bank.amount,
    alreadyClosed: closed.alreadyClosed,
  })

  return { ok: true, saleNumber: closed.saleNumber, transactionId: bank.transactionId }
}

/// ถามธนาคารแทน callback ที่ไม่มา — เรียกจาก `/api/order/[qrToken]/payment` ทุกรอบโพลของลูกค้า
///
/// คืน `null` เมื่อ "ยังไม่ถึงคิวถาม" (ไม่ได้ต่อธนาคาร / ไม่มีใบที่รอเงิน / ยังไม่ครบรอบหน่วง)
/// ผู้เรียกไม่ต้องแยกกรณีเหล่านี้ — ทุกกรณีแปลว่า "ยังไม่มีอะไรเปลี่ยน ตอบสถานะเดิมไปได้เลย"
export async function reconcileSessionPayment(sessionId: string): Promise<SettleResult | null> {
  if (!isScbConfigured()) return null

  const intent = await findPendingIntentBySession(sessionId)
  if (!intent) return null

  // ตั้งใจไม่เช็ค `expiresAt` — ใบหมดอายุแล้วแต่ยังเป็น PENDING แปลว่าเงินก้อนนั้นยังอาจเข้ามาทีหลัง
  // (ลูกค้าเปิดแอปธนาคารค้างไว้แล้วเพิ่งกดจ่าย) เงินที่โอนมาแล้วไม่หายไปตามอายุ QR ของเรา
  if (!(await claimBankPollSlot(intent.id))) return null

  const result = await verifyAndSettleIntent(intent, datesToInquire(intent))

  // รอบที่ยังไม่เจอเงินเป็นเรื่องปกติของทุกครั้งก่อนลูกค้าจ่าย — ไม่ต้อง log ให้รก
  if (!result.ok && result.reason !== "ธนาคารไม่พบรายการชำระเงินที่ตรงกับเลขอ้างอิงนี้") {
    log("โพลแล้วยังปิดบิลไม่ได้", { ref1: intent.ref1, reason: result.reason })
  }

  return result
}
