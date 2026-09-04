import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sendResetPasswordMail, sendVerificationMail } from "@/lib/mail"

const RESET_URL = "https://posqr.jayjayservices.com/reset-password?token=abc123"

describe("lib/mail.ts — ส่งอีเมลผ่าน Resend (Phase 5)", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    delete process.env.MAIL_REPLY_TO
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("ไม่มี API key บน dev = ข้ามการส่ง ไม่ throw และไม่ยิงเน็ต", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    vi.spyOn(console, "info").mockImplementation(() => {})

    const result = await sendResetPasswordMail("staff@example.com", RESET_URL)

    expect(result).toEqual({ ok: true, skipped: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("ไม่มี API key บน production ต้อง throw — ห้ามเงียบแล้วปล่อยผู้ใช้รอเมลที่ไม่มีวันมา", async () => {
    const originalNodeEnv = process.env.NODE_ENV
    try {
      // NODE_ENV เป็น readonly ใน type ของ Node — เขียนผ่าน defineProperty เพื่อจำลอง production
      Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true })
      await expect(sendResetPasswordMail("staff@example.com", RESET_URL)).rejects.toThrow(
        /RESEND_API_KEY/,
      )
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", { value: originalNodeEnv, configurable: true })
    }
  })

  it("ไม่พิมพ์ลิงก์ลง log เมื่อมี API key แล้ว — ลิงก์คือ credential ชั่วคราว", async () => {
    process.env.RESEND_API_KEY = "re_test_key"
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))

    await sendResetPasswordMail("staff@example.com", RESET_URL)

    expect(infoSpy).not.toHaveBeenCalled()
  })

  it("ยิง Resend ด้วย payload ที่ถูกต้องและใส่ลิงก์ทั้งใน html และ text", async () => {
    process.env.RESEND_API_KEY = "re_test_key"
    process.env.MAIL_FROM = "MJD Mobile Order <no-reply@mail.jayjayservices.com>"
    process.env.MAIL_REPLY_TO = "support@example.com"

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }))

    const result = await sendVerificationMail("new@example.com", RESET_URL)
    expect(result).toEqual({ ok: true, skipped: false })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.resend.com/emails")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key")

    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.from).toBe("MJD Mobile Order <no-reply@mail.jayjayservices.com>")
    expect(body.to).toEqual(["new@example.com"])
    expect(body.reply_to).toBe("support@example.com")
    expect(String(body.subject)).toContain("ยืนยันอีเมล")
    expect(String(body.html)).toContain(RESET_URL)
    expect(String(body.text)).toContain(RESET_URL)
  })

  it("ไม่ตั้ง MAIL_REPLY_TO = ไม่ส่งฟิลด์นั้นไปเลย", async () => {
    process.env.RESEND_API_KEY = "re_test_key"
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))

    await sendResetPasswordMail("staff@example.com", RESET_URL)

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body))
    expect("reply_to" in body).toBe(false)
  })

  it("Resend ตอบ error ต้องคืน ok:false พร้อมสาเหตุ ไม่ throw ทิ้งคำขอของผู้ใช้", async () => {
    process.env.RESEND_API_KEY = "re_test_key"
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "domain is not verified" }), { status: 403 }),
    )

    const result = await sendResetPasswordMail("staff@example.com", RESET_URL)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("403")
      expect(result.error).toContain("domain is not verified")
    }
  })

  it("เน็ตล่มระหว่างยิง Resend ต้องคืน ok:false ไม่ใช่ throw", async () => {
    process.env.RESEND_API_KEY = "re_test_key"
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"))

    const result = await sendVerificationMail("staff@example.com", RESET_URL)

    expect(result).toEqual({ ok: false, error: "fetch failed" })
  })

  it("ค่าที่ฝังลง HTML ถูก escape — ลิงก์ที่มี & ต้องไม่ทำให้ markup เพี้ยน", async () => {
    process.env.RESEND_API_KEY = "re_test_key"
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))

    await sendVerificationMail("staff@example.com", "https://example.com/v?token=a&next=/x")

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body))
    expect(String(body.html)).toContain("token=a&amp;next=/x")
    expect(String(body.html)).not.toContain("token=a&next=/x")
  })
})
