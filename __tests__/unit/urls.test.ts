import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { publicBaseUrl } from "@/lib/urls"

describe("publicBaseUrl — origin ที่ฝังลง QR ของโต๊ะ", () => {
  const original = { ...process.env }

  beforeEach(() => {
    delete process.env.APP_BASE_URL
    delete process.env.BETTER_AUTH_URL
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it("ใช้ APP_BASE_URL ก่อนเสมอ", () => {
    process.env.APP_BASE_URL = "https://menu.example.com"
    process.env.BETTER_AUTH_URL = "https://admin.example.com"
    expect(publicBaseUrl()).toBe("https://menu.example.com")
  })

  it("🔥 APP_BASE_URL เป็น string ว่างต้อง fallback ไป BETTER_AUTH_URL", () => {
    // docker compose ยัด `${APP_BASE_URL:-}` เป็นค่าว่าง ไม่ใช่ undefined
    // ของเดิมใช้ ?? จึงไม่ fallback แล้ว QR ได้ค่าเป็น "/order/<token>" เฉย ๆ
    // มือถือที่สแกนเลยเอาไปค้น Google แทนที่จะเปิดเว็บ (เจอจริงบน production)
    process.env.APP_BASE_URL = ""
    process.env.BETTER_AUTH_URL = "https://posqr.jayjayservices.com"
    expect(publicBaseUrl()).toBe("https://posqr.jayjayservices.com")
  })

  it("ค่าที่มีแต่ช่องว่างก็ถือว่าไม่ได้ตั้ง", () => {
    process.env.APP_BASE_URL = "   "
    process.env.BETTER_AUTH_URL = "https://posqr.jayjayservices.com"
    expect(publicBaseUrl()).toBe("https://posqr.jayjayservices.com")
  })

  it("ไม่ตั้งอะไรเลยใช้ localhost ของ dev", () => {
    expect(publicBaseUrl()).toBe("http://localhost:3001")
  })

  it("ตัด / ท้าย URL ทิ้ง ไม่ให้ได้ // ตอนต่อ path", () => {
    process.env.APP_BASE_URL = "https://posqr.jayjayservices.com///"
    expect(publicBaseUrl()).toBe("https://posqr.jayjayservices.com")
  })

  it("ผลลัพธ์ต้องเป็น absolute URL เสมอ — นี่คือเงื่อนไขที่ทำให้ QR สแกนแล้วเปิดเว็บได้", () => {
    process.env.APP_BASE_URL = ""
    process.env.BETTER_AUTH_URL = "https://posqr.jayjayservices.com"
    expect(publicBaseUrl()).toMatch(/^https?:\/\//)
  })
})
