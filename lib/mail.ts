/// จุดเดียวของระบบที่ส่งอีเมล — Phase 5 จะต่อ Resend HTTP API ที่นี่
/// ตอนนี้ยังไม่มี key: dev พิมพ์ลิงก์ลง console, production throw ทิ้ง
/// **ห้ามพิมพ์ลิงก์ยืนยัน/รีเซ็ตรหัสผ่านลง log บน production** — ลิงก์คือ credential ชั่วคราว

type MailPayload = {
  to: string
  subject: string
  url: string
}

function deliver({ to, subject, url }: MailPayload) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ยังไม่ได้ตั้งค่า RESEND_API_KEY — ระบบส่งอีเมลใช้งานไม่ได้")
    }
    console.info(`\n[dev mail] ${subject}\n  ถึง: ${to}\n  ลิงก์: ${url}\n`)
    return
  }
  throw new Error("ยังไม่ได้ต่อ Resend — จะทำใน Phase 5")
}

export function sendResetPasswordMail(to: string, url: string) {
  deliver({ to, subject: "ตั้งรหัสผ่านใหม่", url })
}

export function sendVerificationMail(to: string, url: string) {
  deliver({ to, subject: "ยืนยันอีเมลของคุณ", url })
}
