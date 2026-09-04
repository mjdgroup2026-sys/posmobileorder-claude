import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { prisma } from "@/lib/prisma"
import { sendResetPasswordMail, sendVerificationMail } from "@/lib/mail"

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
    // ปิดการสมัครเอง — ผู้ดูแลสร้างบัญชีให้เท่านั้น
    // ถ้าเปิดไว้ ใครก็สมัครแล้วได้ session ทันที (autoSignIn ทำงานเมื่อไม่บังคับยืนยันอีเมล)
    // ซึ่งแปลว่าผ่าน requireUser() ได้ทุก Server Action — เท่ากับพนักงานเต็มตัว
    // จะเปิดคืนได้ต่อเมื่อมี invite/allowlist (requireEmailVerification เปิดแล้วตั้งแต่ Phase 5)
    disableSignUp: true,
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
  // ต้องอยู่ท้ายสุดเสมอ — ทำให้ Server Action เซ็ต cookie ได้
  plugins: [nextCookies()],
})
