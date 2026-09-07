import { afterEach, describe, expect, it } from "vitest"
import { isQrPaymentAvailable } from "@/lib/payment-methods"

/// กันบั๊กที่เคยหลุดขึ้น production มาแล้ว: ตั้ง SCB ครบทุกตัวแต่ปุ่ม "ชำระด้วยพร้อมเพย์"
/// บนหน้าเลือกวิธีจ่ายยังถูกปิด ขึ้นว่า "ร้านยังไม่ได้เปิดใช้งานพร้อมเพย์" เพราะหน้านั้น
/// เช็คแค่ PROMPTPAY_ID ตัวเดียว → ลูกค้าจ่ายผ่าน QR ไม่ได้เลยทั้งที่ระบบพร้อม

const KEYS = ["PROMPTPAY_ID", "SCB_API_BASE", "SCB_API_KEY", "SCB_API_SECRET", "SCB_BILLER_ID"] as const

const original: Record<string, string | undefined> = {}
for (const key of KEYS) original[key] = process.env[key]

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function configureScb() {
  setEnv({
    SCB_API_BASE: "https://api-sandbox.partners.scb/partners/sandbox",
    SCB_API_KEY: "test-key",
    SCB_API_SECRET: "test-secret",
    SCB_BILLER_ID: "048233443520805",
  })
}

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key] as string
  }
})

describe("isQrPaymentAvailable (Phase 10)", () => {
  it("ไม่ได้ตั้งอะไรเลย = รับ QR ไม่ได้", () => {
    setEnv({})
    expect(isQrPaymentAvailable()).toBe(false)
  })

  it("ตั้ง SCB ครบอย่างเดียว (ไม่มี PROMPTPAY_ID) ต้องรับ QR ได้ ← บั๊กที่เคยหลุด", () => {
    configureScb()
    expect(isQrPaymentAvailable()).toBe(true)
  })

  it("ตั้ง PROMPTPAY_ID อย่างเดียว (ไม่ได้ต่อธนาคาร) ต้องรับ QR ได้", () => {
    setEnv({ PROMPTPAY_ID: "0812345678" })
    expect(isQrPaymentAvailable()).toBe(true)
  })

  it("ตั้งทั้งคู่ก็ยังรับ QR ได้", () => {
    configureScb()
    process.env.PROMPTPAY_ID = "0812345678"
    expect(isQrPaymentAvailable()).toBe(true)
  })

  it("ต่อ SCB แต่ขาด SCB_BILLER_ID = ออก QR ไม่ได้จริง ต้องไม่นับว่าพร้อม", () => {
    configureScb()
    delete process.env.SCB_BILLER_ID
    expect(isQrPaymentAvailable()).toBe(false)
  })
})
