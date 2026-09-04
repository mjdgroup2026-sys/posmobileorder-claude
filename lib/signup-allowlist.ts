/// รายการอีเมล/โดเมนที่สมัครสมาชิกเองได้ (Phase 5)
///
/// **ทำไมต้องมี**: v1 ไม่มีระบบสิทธิ์ตามบทบาท — `requireUser()` เช็คแค่ว่าล็อกอินอยู่
/// ใครสมัครสำเร็จจึงกลายเป็นพนักงานเต็มตัวทันที (แก้สต็อก ขาย void บิล ปิดยอด เห็นยอดขายทั้งหมด)
/// การเปิดสมัครเองโดยไม่มีด่านนี้เท่ากับเปิดหลังร้านให้ทุกคนบนอินเทอร์เน็ต
///
/// ตั้งค่าอย่างน้อยหนึ่งตัว (ใส่พร้อมกันได้ ผ่านตัวใดตัวหนึ่งก็พอ):
///   SIGNUP_ALLOWED_EMAILS=a@example.com,b@example.com
///   SIGNUP_ALLOWED_DOMAINS=example.com,mjdgroup.co.th
///
/// ⚠️ **ไม่ตั้งอะไรเลย = ปฏิเสธทุกคน** (fail closed) ตั้งใจให้พลาดแล้วปลอดภัยไว้ก่อน
/// ดีกว่าเผลอ deploy แล้วเปิดรับคนทั้งโลกโดยไม่รู้ตัว

function parseList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

export type SignupPolicy = {
  emails: string[]
  domains: string[]
  /// ไม่ได้ตั้งค่าอะไรเลย — สมัครไม่ได้สักคน
  unconfigured: boolean
}

export function readSignupPolicy(env: NodeJS.ProcessEnv = process.env): SignupPolicy {
  const emails = parseList(env.SIGNUP_ALLOWED_EMAILS)
  // ตัด "@" นำหน้าให้ด้วย เผื่อคนตั้งเป็น "@example.com" ตามสัญชาตญาณ
  const domains = parseList(env.SIGNUP_ALLOWED_DOMAINS).map((d) => d.replace(/^@/, ""))
  return { emails, domains, unconfigured: emails.length === 0 && domains.length === 0 }
}

/// อีเมลนี้สมัครเองได้ไหม — เทียบแบบ case-insensitive และตัดช่องว่างหัวท้ายทิ้งก่อนเสมอ
export function isSignupAllowed(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const policy = readSignupPolicy(env)
  if (policy.unconfigured) return false

  const normalized = email.trim().toLowerCase()
  // ต้องมี @ และมีอะไรอยู่ทั้งสองฝั่งพอดีหนึ่งตัว — กัน "a@b@c" เล็ดลอดไปเทียบโดเมนผิดตัว
  const parts = normalized.split("@")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false

  if (policy.emails.includes(normalized)) return true
  return policy.domains.includes(parts[1])
}
