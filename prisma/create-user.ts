import "dotenv/config"
import { auth } from "../lib/auth"
import { prisma } from "../lib/prisma"

/// สร้างบัญชีพนักงานจากบรรทัดคำสั่ง — เพราะ `disableSignUp: true` ปิดการสมัครเองไว้ (lib/auth.ts)
///
///   pnpm db:create-user "อีเมล" "รหัสผ่าน" "ชื่อที่แสดง"
///
/// ⚠️ ต้องสร้างผ่าน internalAdapter ของ Better Auth เท่านั้น ห้าม insert ตาราง account เอง —
///    รูปแบบ account ของ credential คือ `issuer = local:credential` และ `accountId = user.id`
///    (ไม่ใช่อีเมล) ถ้าใส่ผิดจะสร้างได้แต่ล็อกอินไม่ผ่าน ตอบ INVALID_EMAIL_OR_PASSWORD
async function main() {
  const [email, password, name] = process.argv.slice(2)

  if (!email || !password) {
    console.error('วิธีใช้: pnpm db:create-user "อีเมล" "รหัสผ่าน" ["ชื่อที่แสดง"]')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.error(`มีบัญชีอีเมล ${email} อยู่แล้ว`)
    process.exit(1)
  }

  const ctx = await auth.$context

  const user = await ctx.internalAdapter.createUser(
    {
      email,
      name: name ?? email.split("@")[0],
      emailVerified: true,
    },
    { method: "email-password" },
  )

  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    // createLocalAccountIssuer("credential") ของ @better-auth/core คืนค่านี้ตรง ๆ
    issuer: "local:credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  })

  console.info(`สร้างบัญชี ${user.email} (${user.name}) เรียบร้อยแล้ว — ล็อกอินได้ทันที`)
}

main()
  .catch((error) => {
    console.error("สร้างบัญชีไม่สำเร็จ:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
