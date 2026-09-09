import "server-only"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { toNumber } from "@/lib/format"

/// จัดการ PaymentIntent — ตัวกลางที่แมป ref1 ที่ส่งไปกับ QR กลับมาเป็นโต๊ะที่จ่ายเงิน
///
/// ทำไมต้องมี ดูคอมเมนต์ของ model `PaymentIntent` ใน prisma/schema.prisma
/// สรุปสั้น ๆ: ref1 ของ SCB รับแค่ A-Z0-9 ไม่เกิน 20 ตัว ยัด cuid ลงไปไม่ได้ และห้ามจับคู่
/// การชำระเงินด้วย "ยอดเงิน" เพราะสองโต๊ะที่ยอดเท่ากันจะทำให้ปิดบิลผิดโต๊ะ

/// QR ที่ระบุจำนวนเงินมีอายุจำกัด — ปล่อยให้ค้างนานเกินไปแล้วลูกค้ากลับมาจ่ายทีหลัง
/// ยอดบนบิลอาจเปลี่ยนไปแล้ว (สั่งเพิ่ม/ยกเลิกรายการ) จึงต้องหมดอายุแล้วออกใบใหม่
const INTENT_TTL_MS = 30 * 60 * 1000

/// ตัดอักษรที่สับสนกันเวลาคนอ่านออกเสียง/พิมพ์ตาม (0/O, 1/I) — เผื่อพนักงานต้องอ่าน ref1 ทางโทรศัพท์
const REF1_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const REF1_LENGTH = 12

/// สุ่ม ref1 จาก crypto ไม่ใช่ Math.random — ref1 เป็นตัวชี้ว่าเงินก้อนไหนเป็นของโต๊ะไหน
/// เดาได้ = ยิง callback ปลอมมาปิดบิลโต๊ะคนอื่นได้ (ยังมี inquiry เป็นด่านหลังอีกชั้น)
function generateRef1(): string {
  const bytes = randomBytes(REF1_LENGTH)
  let out = ""
  for (let i = 0; i < REF1_LENGTH; i++) {
    out += REF1_ALPHABET[bytes[i] % REF1_ALPHABET.length]
  }
  return out
}

export type IssuedIntent = { id: string; ref1: string; amount: number }

/// หา PaymentIntent ที่ใช้ต่อได้ หรือออกใบใหม่ให้โต๊ะนี้
///
/// ใช้ใบเดิมได้เมื่อ **ยอดตรงกันและยังไม่หมดอายุ** เท่านั้น — ลูกค้ากดกลับไปกลับมาบนหน้าจ่ายเงิน
/// ไม่ควรได้ QR ใบใหม่ทุกครั้ง เพราะใบเก่าที่ค้างอยู่ก็ยังจ่ายได้ จะกลายเป็นจ่ายซ้ำสองใบ
/// แต่ถ้าลูกค้าสั่งอาหารเพิ่มจนยอดเปลี่ยน ใบเก่าต้องถูกทิ้งแล้วออกใบใหม่ตามยอดจริง
export async function issuePaymentIntent(sessionId: string, amount: number): Promise<IssuedIntent> {
  const now = new Date()

  const reusable = await prisma.paymentIntent.findFirst({
    where: { tableSessionId: sessionId, status: "PENDING", expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, ref1: true, amount: true },
  })

  if (reusable && toNumber(reusable.amount) === amount) {
    return { id: reusable.id, ref1: reusable.ref1, amount }
  }

  // ยอดเปลี่ยนแล้ว — ปิดใบเก่าที่ยังค้างทั้งหมดก่อน ไม่งั้นลูกค้าอาจสแกนใบเก่าที่ยอดไม่ตรง
  await prisma.paymentIntent.updateMany({
    where: { tableSessionId: sessionId, status: "PENDING" },
    data: { status: "EXPIRED" },
  })

  const created = await prisma.paymentIntent.create({
    data: {
      ref1: generateRef1(),
      tableSessionId: sessionId,
      amount: amount.toFixed(2),
      expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
    },
    select: { id: true, ref1: true },
  })

  return { id: created.id, ref1: created.ref1, amount }
}

export type IntentLookup = {
  id: string
  /// ต้องพกกลับออกไปด้วย — `verifyAndSettleIntent()` ใช้ถาม inquiry ยืนยันกับธนาคารอีกชั้น
  /// ก่อนปิดบิล จึงเชื่อ ref1 ที่มากับ callback ตรง ๆ ไม่ได้
  ref1: string
  tableSessionId: string
  amount: number
  status: string
  expiresAt: Date
}

/// หา intent จาก ref1 ที่ธนาคารส่งกลับมาใน callback
export async function findIntentByRef1(ref1: string): Promise<IntentLookup | null> {
  const found = await prisma.paymentIntent.findUnique({
    where: { ref1 },
    select: { id: true, ref1: true, tableSessionId: true, amount: true, status: true, expiresAt: true },
  })
  if (!found) return null
  return { ...found, amount: toNumber(found.amount) }
}

/// ปิด intent เป็นจ่ายแล้ว — เขียน transactionId ไว้กัน callback ซ้ำอีกชั้นนอกจาก Sale.paymentReference
export async function markIntentPaid(intentId: string, transactionId: string): Promise<void> {
  await prisma.paymentIntent.updateMany({
    where: { id: intentId, status: "PENDING" },
    data: { status: "PAID", transactionId, paidAt: new Date() },
  })
}

/// ธนาคารแจ้งว่าจ่ายแล้วแต่ข้อมูลไม่ผ่านการตรวจ (ยอดไม่ตรง / ธนาคารไม่ยืนยัน)
/// ห้ามปิดบิลเอง ต้องให้พนักงานตรวจ — เงินอาจเข้าจริงแต่ไม่ครบ
///
/// คืน true เฉพาะ "ครั้งที่เปลี่ยนสถานะได้จริง" — ผู้เรียกใช้ค่านี้เป็นตัวกันแจ้งเตือนซ้ำ
/// เพราะเคสเดียวกันถูกตรวจเจอได้หลายรอบ: ธนาคาร retry callback 3 ครั้ง ห่างกัน 12 วินาที
/// ถ้าสร้าง Notification ทุกรอบ พนักงานจะได้แจ้งเตือนเรื่องเดียวกันสามใบ
export async function markIntentFailed(intentId: string): Promise<boolean> {
  const failed = await prisma.paymentIntent.updateMany({
    where: { id: intentId, status: "PENDING" },
    data: { status: "FAILED" },
  })
  return failed.count > 0
}
