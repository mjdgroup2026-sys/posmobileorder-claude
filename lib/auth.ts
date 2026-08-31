import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { prisma } from "@/lib/prisma"
import { sendResetPasswordMail } from "@/lib/mail"

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // ปิดการสมัครเอง — ผู้ดูแลสร้างบัญชีให้เท่านั้น
    // ถ้าเปิดไว้ ใครก็สมัครแล้วได้ session ทันที (autoSignIn ทำงานเมื่อไม่บังคับยืนยันอีเมล)
    // ซึ่งแปลว่าผ่าน requireUser() ได้ทุก Server Action — เท่ากับพนักงานเต็มตัว
    // จะเปิดคืนได้ต่อเมื่อมี invite/allowlist + requireEmailVerification: true (Phase 5)
    disableSignUp: true,
    // v1 ยังไม่บังคับยืนยันอีเมล — เปิดใน Phase 5 พร้อมต่อ Resend
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      sendResetPasswordMail(user.email, url)
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // ต้องอยู่ท้ายสุดเสมอ — ทำให้ Server Action เซ็ต cookie ได้
  plugins: [nextCookies()],
})
