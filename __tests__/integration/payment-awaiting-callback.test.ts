import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ActionResult } from "@/lib/types"
import {
  createTestMenuItem,
  createTestOrder,
  createTestOrderItem,
  createTestQrCode,
  createTestTable,
  disconnectTestDb,
  ensureTestUser,
  isTestDbReachable,
  resetDb,
  setStoreSettings,
  testPrisma,
} from "../helpers/db"
import { makeFormData } from "../helpers/form"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => ({ id: "test-user", name: "ผู้ทดสอบ", email: "test@example.com" })),
  getSession: vi.fn(async () => ({ user: { id: "test-user" } })),
}))

const dbReady = await isTestDbReachable()

/// แจ้งเตือนพนักงานเมื่อออก QR ไปแล้วเกิน 3 นาทีแต่ธนาคารยังไม่ยืนยัน
///
/// เป็นตาข่ายรองรับเดียวที่เหลืออยู่หลังถอดเส้นทางโพลออก (ตัดสินใจ 2026-09-09) — **เตือนอย่างเดียว
/// ไม่ปิดบิลและไม่ยิงถามธนาคาร** คนที่ตัดสินใจว่าเงินเข้าจริงหรือไม่คือพนักงาน
describe.skipIf(!dbReady)("เตือนพนักงานเมื่อ callback ของธนาคารไม่มาภายใน 3 นาที", () => {
  let openTableSession: (formData: FormData) => Promise<ActionResult<{ sessionId: string }>>
  let issuePaymentIntent: typeof import("@/lib/payment-intent").issuePaymentIntent
  let listPaymentsAwaitingCallback: typeof import("@/lib/queries").listPaymentsAwaitingCallback
  let countPaymentsAwaitingCallback: typeof import("@/lib/queries").countPaymentsAwaitingCallback
  let getPendingNotificationCount: typeof import("@/lib/queries").getPendingNotificationCount

  beforeAll(async () => {
    const tables = await import("@/app/actions/tables")
    const intents = await import("@/lib/payment-intent")
    const queries = await import("@/lib/queries")
    openTableSession = tables.openTableSession
    issuePaymentIntent = intents.issuePaymentIntent
    listPaymentsAwaitingCallback = queries.listPaymentsAwaitingCallback
    countPaymentsAwaitingCallback = queries.countPaymentsAwaitingCallback
    getPendingNotificationCount = queries.getPendingNotificationCount
  })

  beforeEach(async () => {
    await resetDb()
    await ensureTestUser()
    await setStoreSettings({ hasKDS: false, serviceChargePercent: "0.00" })
  })

  afterAll(async () => {
    await disconnectTestDb()
  })

  async function seedSessionWithIntent() {
    const table = await createTestTable()
    const qr = await createTestQrCode(table.id, { type: "DYNAMIC" })
    const opened = await openTableSession(makeFormData({ qrToken: qr.token }))
    expect(opened.ok).toBe(true)
    const sessionId = opened.ok === true ? (opened.data?.sessionId ?? "") : ""

    const menu = await createTestMenuItem({ name: "ข้าวกะเพราหมู", price: "130.00" })
    const order = await createTestOrder(sessionId)
    await createTestOrderItem(order.id, menu.id, { quantity: 2, unitPrice: "130.00" })

    const intent = await issuePaymentIntent(sessionId, 260)
    return { table, sessionId, intent }
  }

  /// ย้อนเวลาที่ออก QR ให้เก่ากว่าที่กำหนด — เร็วกว่ารอจริง 3 นาทีในเทส
  async function backdateIntent(intentId: string, minutesAgo: number) {
    await testPrisma().paymentIntent.update({
      where: { id: intentId },
      data: { createdAt: new Date(Date.now() - minutesAgo * 60_000) },
    })
  }

  it("เพิ่งออก QR ยังไม่ถึง 3 นาที → ยังไม่เตือน", async () => {
    const { intent } = await seedSessionWithIntent()
    await backdateIntent(intent.id, 2)

    expect(await listPaymentsAwaitingCallback()).toHaveLength(0)
    expect(await countPaymentsAwaitingCallback()).toBe(0)
  })

  it("เกิน 3 นาทีแล้วยังไม่มี callback → เตือน พร้อมเลขอ้างอิงและยอดให้พนักงานไปตรวจ", async () => {
    const { table, intent } = await seedSessionWithIntent()
    await backdateIntent(intent.id, 4)

    const rows = await listPaymentsAwaitingCallback()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tableCode).toBe(table.code)
    expect(rows[0]?.tableId).toBe(table.id)
    // ref1 คือตัวที่พนักงานเอาไปค้นรายการในแอปธนาคาร ขาดไม่ได้
    expect(rows[0]?.ref1).toBe(intent.ref1)
    expect(rows[0]?.amount).toBe(260)
  })

  it("callback มาถึงแล้วปิดบิลไปแล้ว → การเตือนหายเอง ไม่ต้องมีใครมากดปิด", async () => {
    const { intent, sessionId } = await seedSessionWithIntent()
    await backdateIntent(intent.id, 10)
    expect(await listPaymentsAwaitingCallback()).toHaveLength(1)

    const closeSession = await import("@/lib/close-session")
    const intents = await import("@/lib/payment-intent")
    const closed = await closeSession.closeSessionWithPayment({
      sessionId,
      paymentMethod: "PROMPTPAY",
      paymentReference: "SCBTX-LATE",
      amountReceived: 260,
    })
    expect(closed.ok).toBe(true)
    await intents.markIntentPaid(intent.id, "SCBTX-LATE")

    expect(await listPaymentsAwaitingCallback()).toHaveLength(0)
  })

  it("พนักงานปิดบิลด้วยมือ → การเตือนหายเองแม้ intent ยังค้างเป็น PENDING", async () => {
    const db = testPrisma()
    const { intent, sessionId } = await seedSessionWithIntent()
    await backdateIntent(intent.id, 10)

    const closeSession = await import("@/lib/close-session")
    const closed = await closeSession.closeSessionWithPayment({
      sessionId,
      paymentMethod: "CASH",
      cashierId: "test-user",
      amountReceived: 260,
    })
    expect(closed.ok).toBe(true)

    // ใบยังเป็น PENDING อยู่ แต่โต๊ะปิดไปแล้ว จึงต้องไม่เตือนค้างไว้ให้พนักงานสับสน
    expect((await db.paymentIntent.findUnique({ where: { id: intent.id } }))?.status).toBe("PENDING")
    expect(await listPaymentsAwaitingCallback()).toHaveLength(0)
  })

  it("ลูกค้าสั่งเพิ่มจนต้องออก QR ใบใหม่ → นับเฉพาะใบใหม่ ใบเก่าที่ EXPIRED ไม่ถูกเตือนซ้ำ", async () => {
    const { sessionId, intent } = await seedSessionWithIntent()
    await backdateIntent(intent.id, 10)

    // ยอดเปลี่ยน → issuePaymentIntent ปิดใบเก่าเป็น EXPIRED แล้วออกใบใหม่
    const fresh = await issuePaymentIntent(sessionId, 390)
    expect(fresh.ref1).not.toBe(intent.ref1)

    // ใบใหม่เพิ่งออก ยังไม่ถึง 3 นาที → ไม่มีอะไรต้องเตือน
    expect(await listPaymentsAwaitingCallback()).toHaveLength(0)

    await backdateIntent(fresh.id, 4)
    const rows = await listPaymentsAwaitingCallback()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.ref1).toBe(fresh.ref1)
    expect(rows[0]?.amount).toBe(390)
  })

  it("ยอดไม่ตรงจน mark FAILED ไปแล้ว → ไม่เตือนซ้ำ เพราะมี Notification ของตัวเองอยู่แล้ว", async () => {
    const { intent } = await seedSessionWithIntent()
    await backdateIntent(intent.id, 10)

    const intents = await import("@/lib/payment-intent")
    expect(await intents.markIntentFailed(intent.id)).toBe(true)

    expect(await listPaymentsAwaitingCallback()).toHaveLength(0)
  })

  it("badge ของพนักงานต้องรวมรายการนี้ด้วย ไม่งั้นไม่มีใครรู้ว่ามีเรื่องต้องดู", async () => {
    const db = testPrisma()
    const { intent, sessionId } = await seedSessionWithIntent()

    expect(await getPendingNotificationCount()).toBe(0)

    await db.notification.create({ data: { tableSessionId: sessionId, type: "CALL_STAFF" } })
    expect(await getPendingNotificationCount()).toBe(1)

    await backdateIntent(intent.id, 4)
    expect(await getPendingNotificationCount()).toBe(2)
  })
})
