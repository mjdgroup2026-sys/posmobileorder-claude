import fs from "node:fs"

// ── lib/auth.ts — เปิดสมัครเองพร้อมด่าน allowlist ────────────────────────
{
  const p = "lib/auth.ts"
  let s = fs.readFileSync(p, "utf8")

  s = s.replace(
    'import { betterAuth } from "better-auth"',
    'import { betterAuth } from "better-auth"\nimport { createAuthMiddleware, APIError } from "better-auth/api"',
  )
  s = s.replace(
    'import { sendResetPasswordMail, sendVerificationMail } from "@/lib/mail"',
    'import { sendResetPasswordMail, sendVerificationMail } from "@/lib/mail"\nimport { isSignupAllowed, readSignupPolicy } from "@/lib/signup-allowlist"',
  )

  const oldBlock = [
    "    // ปิดการสมัครเอง — ผู้ดูแลสร้างบัญชีให้เท่านั้น",
    "    // ถ้าเปิดไว้ ใครก็สมัครแล้วได้ session ทันที (autoSignIn ทำงานเมื่อไม่บังคับยืนยันอีเมล)",
    "    // ซึ่งแปลว่าผ่าน requireUser() ได้ทุก Server Action — เท่ากับพนักงานเต็มตัว",
    "    // จะเปิดคืนได้ต่อเมื่อมี invite/allowlist (requireEmailVerification เปิดแล้วตั้งแต่ Phase 5)",
    "    disableSignUp: true,",
  ].join("\n")

  const newBlock = [
    "    // เปิดสมัครเองได้ แต่ผ่านด่าน allowlist เท่านั้น (hooks.before ด้านล่าง)",
    "    //",
    "    // ⚠️ v1 ไม่มีระบบสิทธิ์ตามบทบาท — `requireUser()` เช็คแค่ว่าล็อกอินอยู่ ใครสมัครสำเร็จ",
    "    //    จึงเป็นพนักงานเต็มตัวทันที · ด่านที่กันคนนอกจึงมีสองชั้นและต้องมีครบทั้งคู่:",
    "    //    1. allowlist ที่ hooks.before (กันตั้งแต่ก่อนสร้าง user)",
    "    //    2. requireEmailVerification (ต้องคุมอีเมลนั้นได้จริงถึงจะล็อกอินได้)",
    "    disableSignUp: false,",
  ].join("\n")

  if (s.split(oldBlock).length - 1 !== 1) throw new Error("disableSignUp anchor")
  s = s.replace(oldBlock, newBlock)

  // เพิ่ม hooks ก่อน plugins
  const oldPlugins = [
    "  // ต้องอยู่ท้ายสุดเสมอ — ทำให้ Server Action เซ็ต cookie ได้",
    "  plugins: [nextCookies()],",
  ].join("\n")

  const newHooks = [
    "  hooks: {",
    "    // ★ ด่านกันคนนอกสมัคร — ทำงานก่อนสร้าง user เสมอ ไม่ว่าคำขอจะมาจากหน้าเว็บหรือยิง API ตรง",
    "    //   ห้ามพึ่งการซ่อนหน้า /register อย่างเดียว เพราะ endpoint เรียกตรงได้",
    "    before: createAuthMiddleware(async (ctx) => {",
    "      if (ctx.path !== \"/sign-up/email\") return",
    "",
    "      const email = typeof ctx.body?.email === \"string\" ? ctx.body.email : \"\"",
    "      if (isSignupAllowed(email)) return",
    "",
    "      // ข้อความต่างกันตามสาเหตุ เพื่อให้ผู้ดูแลรู้ว่าลืมตั้ง env ไม่ใช่ผู้ใช้กรอกผิด",
    "      const message = readSignupPolicy().unconfigured",
    "        ? \"ระบบยังไม่ได้เปิดรับสมัครสมาชิก กรุณาติดต่อผู้ดูแลระบบ\"",
    "        : \"อีเมลนี้ไม่อยู่ในรายชื่อที่สมัครได้ กรุณาใช้อีเมลขององค์กรหรือติดต่อผู้ดูแลระบบ\"",
    "      throw new APIError(\"FORBIDDEN\", { code: \"EMAIL_NOT_ALLOWED\", message })",
    "    }),",
    "  },",
    "  // ต้องอยู่ท้ายสุดเสมอ — ทำให้ Server Action เซ็ต cookie ได้",
    "  plugins: [nextCookies()],",
  ].join("\n")

  if (s.split(oldPlugins).length - 1 !== 1) throw new Error("plugins anchor")
  s = s.replace(oldPlugins, newHooks)

  fs.writeFileSync(p, s, "utf8")
}

// ── proxy.ts — เปิดหน้า /register กลับมา ─────────────────────────────────
{
  const p = "proxy.ts"
  let s = fs.readFileSync(p, "utf8")
  const old = [
    "// หน้า auth ของพนักงาน — เข้าได้โดยไม่ต้องล็อกอิน แต่ถ้าล็อกอินอยู่แล้วให้เด้งกลับหน้าแรก",
    "// หมายเหตุ: \"/register\" ถูกถอดออกโดยตั้งใจ — ปิดการสมัครเองแล้ว (ดู disableSignUp ใน lib/auth.ts)",
    'const AUTH_PAGE_PREFIXES = ["/login", "/forgot-password", "/reset-password"]',
  ].join("\n")
  const nw = [
    "// หน้า auth ของพนักงาน — เข้าได้โดยไม่ต้องล็อกอิน แต่ถ้าล็อกอินอยู่แล้วให้เด้งกลับหน้าแรก",
    "// \"/register\" เปิดคืนแล้วใน Phase 5 — ด่านจริงที่กันคนนอกคือ allowlist ใน lib/auth.ts",
    "// ไม่ใช่การซ่อนหน้านี้ (endpoint /api/auth/sign-up/email เรียกตรงได้อยู่ดี)",
    'const AUTH_PAGE_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password"]',
  ].join("\n")
  if (s.split(old).length - 1 !== 1) throw new Error("proxy anchor")
  fs.writeFileSync(p, s.replace(old, nw), "utf8")
}

console.log("ok")
