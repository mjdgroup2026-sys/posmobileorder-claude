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

/// mock เฉพาะการยิงออกไปหาธนาคาร — ตรรกะที่เหลือใน scb.ts ใช้ของจริง
/// isScbConfigured ต้อง mock ด้วย เพราะเทสไม่ได้ตั้ง env ของ SCB ไว้ (และไม่ควรตั้ง)
const inquireMock = vi.fn()
const configuredMock = vi.fn(() => true)
vi.mock("@/lib/payment-provider/scb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payment-provider/scb")>()
  return {
    ...actual,
    inquireBillPayment: (...args: unknown[]) => inquireMock(...args),
    isScbConfigured: () => configuredMock(),
  }
})

const dbReady = await isTestDbReachable()

/// เส้นทางโพล: ลูกค้าเปิดหน้ารอชำระเงินค้างไว้ แล้วแอปถามธนาคารเองว่าเงินเข้าหรือยัง
///
/// จำเป็นเพราะ callback ของ SCB ไม่เคยยิงมาถึงเราเลย (ตรวจ log จริง 2026-09-09: 23 ชั่วโมง
/// มีแต่ curl ทดสอบของเราเอง) เส้นทางนี้จึงเป็นตัวหลักที่ทำให้บิลปิดเอง ไม่ใช่ทางสำรอง
describe.skipIf(!dbReady)("โพลถามธนาคารเองแทน callback ที่ไม่มา", () => {
  let openTableSession: (formData: FormData) => Promise<ActionResult<{ sessionId: string }>>
  let issuePaymentIntent: typeof import("@/lib/payment-intent").issuePaymentIntent
  let GET: typeof import("@/app/api/order/[qrToken]/payment/route").GET

  beforeAll(async () => {
    const tables = await import("@/app/actions/tables")
    const intents = await import("@/lib/payment-intent")
    const route = await import("@/app/api/order/[qrToken]/payment/route")
    openTableSession = tables.openTableSession
    issuePaymentIntent = intents.issuePaymentIntent
    GET = route.GET
  })

  beforeEach(async () => {
    await resetDb()
    await ensureTestUser()
    await setStoreSettings({ hasKDS: false, serviceChargePercent: "0.00" })
    inquireMock.mockReset()
    configuredMock.mockReset()
    configuredMock.mockReturnValue(true)
  })

  afterAll(async () => {
    await disconnectTestDb()
  })

  /// โต๊ะที่มีออร์เดอร์รวม 260 บาท + PaymentIntent ที่ออก QR ไว้แล้ว (seed เดียวกับเทส webhook)
  async function seedSessionWithIntent() {
    const table = await createTestTable()
    const qr = await createTestQrCode(table.id, { type: "DYNAMIC" })
    const opened = await openTableSession(makeFormData({ qrToken: qr.token }))
    expect(opened.ok).toBe(true)
    const sessionId = opened.ok === true ? (opened.data?.sessionId ?? "") : ""

    const menuA = await createTestMenuItem({ name: "ข้าวกะเพราหมู", price: "80.00" })
    const menuB = await createTestMenuItem({ name: "ต้มยำกุ้ง", price: "100.00" })
    const order = await createTestOrder(sessionId)
    await createTestOrderItem(order.id, menuA.id, { quantity: 2, unitPrice: "80.00" })
    await createTestOrderItem(order.id, menuB.id, { quantity: 1, unitPrice: "100.00" })

    const intent = await issuePaymentIntent(sessionId, 260)
    return { table, qr, sessionId, intent }
  }

  function poll(qrToken: string) {
    const request = new Request(`http://localhost/api/order/${qrToken}/payment`)
    const context = { params: Promise.resolve({ qrToken }) }
    return GET(request as Parameters<typeof GET>[0], context as Parameters<typeof GET>[1])
  }

  /// ปลดล็อกตัวหน่วง 10 วินาทีโดยไม่ต้องรอจริง — ย้อน lastPolledAt ให้เก่าพอ
  async function allowNextPoll(intentId: string) {
    await testPrisma().paymentIntent.update({
      where: { id: intentId },
      data: { lastPolledAt: new Date(Date.now() - 60_000) },
    })
  }

  it("เงินเข้าแล้ว → รอบโพลปิดบิลเองเป็น Sale channel MOBILE_ORDER โดยไม่ต้องมี callback", async () => {
    const db = testPrisma()
    const { table, qr, sessionId, intent } = await seedSessionWithIntent()

    inquireMock.mockResolvedValue({
      ok: true,
      data: { transactionId: "SCBTX-POLL-1", amount: 260, billPaymentRef1: intent.ref1 },
    })

    const response = await poll(qr.token)
    const body = await response.json()

    // ต้องตอบ PAID ในรอบเดียวกับที่ปิดบิล ไม่ใช่ให้ลูกค้ารออีกรอบ
    expect(body.ok).toBe(true)
    expect(body.status.state).toBe("PAID")

    const sale = await db.sale.findFirst({ where: { tableSessionId: sessionId } })
    expect(sale?.channel).toBe("MOBILE_ORDER")
    expect(sale?.paymentMethod).toBe("PROMPTPAY")
    expect(sale?.paymentReference).toBe("SCBTX-POLL-1")
    expect(Number(sale?.total)).toBe(260)

    const reloadedIntent = await db.paymentIntent.findUnique({ where: { id: intent.id } })
    expect(reloadedIntent?.status).toBe("PAID")
    expect(reloadedIntent?.transactionId).toBe("SCBTX-POLL-1")

    const session = await db.tableSession.findUnique({ where: { id: sessionId } })
    expect(session?.status).toBe("CLOSED")
    expect((await db.table.findUnique({ where: { id: table.id } }))?.status).toBe("EMPTY")

    // DYNAMIC QR ต้องถูกปิดพร้อมกันในทรานแซคชันเดียว เหมือนเส้นทาง callback
    expect((await db.qRCode.findUnique({ where: { id: qr.id } }))?.status).toBe("INVALIDATED")
  })

  it("ยังไม่จ่าย → ตอบยอดบิลตามปกติ ไม่ปิดบิล และไม่ mark FAILED", async () => {
    const db = testPrisma()
    const { qr, sessionId, intent } = await seedSessionWithIntent()

    inquireMock.mockResolvedValue({ ok: false, error: "ธนาคารไม่พบรายการชำระเงินที่ตรงกับเลขอ้างอิงนี้" })

    const body = await (await poll(qr.token)).json()
    expect(body.ok).toBe(true)
    expect(body.status.state).toBe("UNPAID")
    expect(body.status.total).toBe(260)

    expect(await db.sale.findFirst({ where: { tableSessionId: sessionId } })).toBeNull()

    // ต้องยัง PENDING — รอบก่อนลูกค้าจ่ายเป็นเรื่องปกติ ปิดใบทิ้งคือทำให้เงินที่เข้าทีหลังจับคู่ไม่ได้
    expect((await db.paymentIntent.findUnique({ where: { id: intent.id } }))?.status).toBe("PENDING")
  })

  it("โพลรัว ๆ ติดกัน → ถามธนาคารครั้งเดียว (กันเปลืองโควตาและกันคนนอกยิงถล่ม)", async () => {
    const { qr, intent } = await seedSessionWithIntent()

    inquireMock.mockResolvedValue({ ok: false, error: "ธนาคารไม่พบรายการชำระเงินที่ตรงกับเลขอ้างอิงนี้" })

    for (let i = 0; i < 5; i++) {
      await poll(qr.token)
    }
    expect(inquireMock).toHaveBeenCalledTimes(1)

    // พ้นรอบหน่วงแล้วต้องถามได้อีกครั้ง ไม่ใช่ถามครั้งเดียวตลอดกาล
    await allowNextPoll(intent.id)
    await poll(qr.token)
    expect(inquireMock).toHaveBeenCalledTimes(2)
  })

  it("หลายเครื่องบนโต๊ะเดียวกันโพลพร้อมกัน 10 คำขอ → ถามธนาคารครั้งเดียว", async () => {
    const { qr } = await seedSessionWithIntent()

    inquireMock.mockResolvedValue({ ok: false, error: "ธนาคารไม่พบรายการชำระเงินที่ตรงกับเลขอ้างอิงนี้" })

    // ด่านกันซ้ำต้องเป็น conditional update จริง ไม่ใช่ read-then-write — ยิงพร้อมกันจึงต้องผ่านแค่ 1
    await Promise.all(Array.from({ length: 10 }, () => poll(qr.token)))
    expect(inquireMock).toHaveBeenCalledTimes(1)
  })

  it("เงินเข้าแล้วแต่มีคนสั่งเพิ่มจนบิลแพงกว่ายอดที่โอน → ห้ามปิดบิล ต้องแจ้งพนักงาน", async () => {
    const db = testPrisma()
    const { qr, sessionId, intent } = await seedSessionWithIntent()

    // ลูกค้าอีกคนบนโต๊ะเดียวกันสั่งเพิ่ม 100 บาทหลังออก QR ไปแล้ว → บิลจริงกลายเป็น 360
    const extra = await createTestMenuItem({ name: "ข้าวผัดปู", price: "100.00" })
    const order2 = await createTestOrder(sessionId, 2)
    await createTestOrderItem(order2.id, extra.id, { quantity: 1, unitPrice: "100.00" })

    inquireMock.mockResolvedValue({
      ok: true,
      data: { transactionId: "SCBTX-SHORT-POLL", amount: 260, billPaymentRef1: intent.ref1 },
    })

    const body = await (await poll(qr.token)).json()
    expect(body.status.state).toBe("UNPAID")

    // เงิน 260 เข้าจริงแต่บิล 360 — ปิดบิลตรงนี้คือร้านขาดเงิน 100 บาทโดยไม่มีใครรู้
    expect(await db.sale.findFirst({ where: { tableSessionId: sessionId } })).toBeNull()
    expect((await db.tableSession.findUnique({ where: { id: sessionId } }))?.status).not.toBe("CLOSED")
    expect((await db.paymentIntent.findUnique({ where: { id: intent.id } }))?.status).toBe("FAILED")

    const notification = await db.notification.findFirst({
      where: { tableSessionId: sessionId, type: "CHECK_BILL" },
    })
    expect(notification?.reason).toContain("ได้รับเงิน 260.00 บาทแล้ว")
    expect(notification?.reason).toContain("SCBTX-SHORT-POLL")
  })

  it("เคสเดิมถูกตรวจเจอซ้ำหลายรอบ → แจ้งพนักงานใบเดียว ไม่ใช่ทุกรอบโพล", async () => {
    const db = testPrisma()
    const { qr, sessionId, intent } = await seedSessionWithIntent()

    // ลูกค้าแก้จำนวนเงินในแอปธนาคารเป็น 200 ทั้งที่บิล 260
    inquireMock.mockResolvedValue({
      ok: true,
      data: { transactionId: "SCBTX-MISMATCH", amount: 200, billPaymentRef1: intent.ref1 },
    })

    await poll(qr.token)
    await allowNextPoll(intent.id)
    await poll(qr.token)
    await allowNextPoll(intent.id)
    await poll(qr.token)

    const notifications = await db.notification.findMany({
      where: { tableSessionId: sessionId, type: "CHECK_BILL" },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.reason).toContain("ยอดชำระไม่ตรงกับบิล")

    // ใบถูกปิดเป็น FAILED แล้ว รอบถัดไปจึงไม่มี intent ให้โพลอีก — ต้องไม่ไปรบกวนธนาคารซ้ำ
    expect(inquireMock).toHaveBeenCalledTimes(1)
    expect((await db.paymentIntent.findUnique({ where: { id: intent.id } }))?.status).toBe("FAILED")
  })

  it("ร้านที่ยังไม่ได้ต่อ SCB → ไม่ยิงหาธนาคารเลย", async () => {
    configuredMock.mockReturnValue(false)
    const { qr } = await seedSessionWithIntent()

    const body = await (await poll(qr.token)).json()
    expect(body.status.state).toBe("UNPAID")
    expect(inquireMock).not.toHaveBeenCalled()
  })

  it("ธนาคารล่มระหว่างโพล → ลูกค้ายังเห็นยอดบิลของตัวเอง ไม่ใช่หน้าพัง", async () => {
    const { qr } = await seedSessionWithIntent()

    inquireMock.mockRejectedValue(new Error("เชื่อมต่อธนาคารไม่ได้"))

    const response = await poll(qr.token)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.status.total).toBe(260)
  })
})
