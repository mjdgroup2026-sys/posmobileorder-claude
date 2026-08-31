import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"

const createClient = () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("ไม่พบ DATABASE_URL — ตรวจไฟล์ .env ก่อนเริ่มระบบ")
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> }

export const prisma = globalForPrisma.prisma ?? createClient()

// dev: กัน hot-reload สร้าง client ใหม่ทุกครั้งจนเปลือง connection pool
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
