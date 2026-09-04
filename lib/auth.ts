import { betterAuth } from "better-auth"
import { createAuthMiddleware, APIError } from "better-auth/api"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { prisma } from "@/lib/prisma"
import { sendResetPasswordMail, sendVerificationMail } from "@/lib/mail"
import { isSignupAllowed, readSignupPolicy } from "@/lib/signup-allowlist"

/// Better Auth ตั้ง callbackURL ปลายทางเป็น "/" มาให้ — เปลี่ยนเป็น /verify-email เพื่อให้ผู้ใช้
/// เห็นผลลัพธ์การยืนยัน (สำเร็จ/ลิงก์หมดอายุ) แทนที่จะถูกโยนไปหน้าแรกแล้วเดาเอาเอง
function withVerifyCallback(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    url.searchParams.set("callbackURL", "/verify-email")
    return url.toString()
  } catch {
    return rawUrl
  }
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // เปิดสมัครเองได้ แต่ต้องผ่านด่าน allowlist เท่านั้น (hooks.before ด้านล่าง)
    //
    // ⚠️ v1 ไม่มีระบบสิทธิ์ตามบทบาท — `requireUser()` เช็คแค่ว่าล็อกอินอยู่ ใครสมัครสำเร็จ
    //    จึงกลายเป็นพนักงานเต็มตัวทันที (แก้สต็อก ขาย void บิล ปิดยอด เห็นยอดขายทั้งหมด)
    //    ด่านที่กันคนนอกจึงมีสองชั้น และต้องมีครบทั้งคู่:
    //      1. allowlist ที่ hooks.before — กันตั้งแต่ก่อนสร้าง user
    //      2. requireEmailVerification — ต้องคุมอีเมลนั้นได้จริงถึงจะล็อกอินได้
    disableSignUp: false,
    // ★ ต้องยืนยันอีเมลก่อนจึงล็อกอินได้ — ล็อกอินก่อนยืนยันได้ 403 code EMAIL_NOT_VERIFIED
    //   บัญชีที่ผู้ดูแลสร้างด้วย `pnpm db:create-user` ถูกตั้ง emailVerified = true มาแล้ว
    //   จึงล็อกอินได้ทันทีโดยไม่ต้องรออีเมล
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      // ส่งไม่สำเร็จต้องไม่ทำให้คำขอทั้งก้อนพัง — ผู้ใช้กดขอใหม่ได้ และ log ไว้ให้ตามได้
      const result = await sendResetPasswordMail(user.email, url)
      if (!result.ok) console.error("[mail] ส่งอีเมลตั้งรหัสผ่านใหม่ไม่สำเร็จ:", result.error)
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // ยืนยันแล้วยังต้องล็อกอินเองอีกครั้ง — ลิงก์ในอีเมลถูกส่งต่อ/แชร์ได้ ไม่ควรแลกเป็น session ทันที
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      const result = await sendVerificationMail(user.email, withVerifyCallback(url))
      if (!result.ok) console.error("[mail] ส่งอีเมลยืนยันไม่สำเร็จ:", result.error)
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  hooks: {
    // ★ ด่านกันคนนอกสมัคร — ทำงานก่อนสร้าง user เสมอ ไม่ว่าคำขอจะมาจากหน้า /register
    //   หรือยิง POST /api/auth/sign-up/email ตรง ๆ · ห้ามพึ่งการซ่อนหน้าเว็บอย่างเดียว
    //   ด้วยเหตุผลเดียวกับกติกาข้อ 5 (Server Action ถูกเรียกตรงได้)
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return

      const email = typeof ctx.body?.email === "string" ? ctx.body.email : ""
      if (isSignupAllowed(email)) return

      // แยกข้อความตามสาเหตุ เพื่อให้ผู้ดูแลรู้ว่า "ลืมตั้ง env" ไม่ใช่ "ผู้ใช้กรอกผิด"
      const message = readSignupPolicy().unconfigured
        ? "ระบบยังไม่ได้เปิดรับสมัครสมาชิก กรุณาติดต่อผู้ดูแลระบบ"
        : "อีเมลนี้ไม่อยู่ในรายชื่อที่สมัครได้ กรุณาใช้อีเมลขององค์กร หรือติดต่อผู้ดูแลระบบ"
      throw new APIError("FORBIDDEN", { code: "EMAIL_NOT_ALLOWED", message })
    }),
  },
  // ต้องอยู่ท้ายสุดเสมอ — ทำให้ Server Action เซ็ต cookie ได้
  plugins: [nextCookies()],
})
