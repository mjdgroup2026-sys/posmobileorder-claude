import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/// health check สำหรับ HEALTHCHECK ของ container, nginx และสคริปต์ deploy (ops/health-alert.sh)
/// 200 = แอปขึ้นและต่อฐานข้อมูลได้ · 503 = ฐานข้อมูลไม่ตอบ (ห้ามรับ traffic)

// ต้องเป็น dynamic — ไม่งั้น Next จะ prerender GET handler ตอน build แล้วแช่คำตอบไว้
// กลายเป็นว่า endpoint ตอบ 200 ค้างตลอดแม้ฐานล่ม (ตอน build ก็ไม่มีฐานจริงให้ต่อด้วย)
export const dynamic = "force-dynamic"

/// ฐานที่ล่มแบบ "ไม่ตอบเลย" ต่างจากฐานที่ปฏิเสธ connection — TCP ค้างได้เป็นนาที
/// สคริปต์ deploy ยิงทุก 0.2 วินาที ถ้าปล่อยค้างคำขอจะกองจนแอปตาย ต้องตัดเองที่ 5 วินาที
const DB_TIMEOUT_MS = 5000

class DatabaseTimeoutError extends Error {
  constructor() {
    super(`ฐานข้อมูลไม่ตอบภายใน ${DB_TIMEOUT_MS} มิลลิวินาที`)
    this.name = "DatabaseTimeoutError"
  }
}

async function pingDatabase() {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DatabaseTimeoutError()), DB_TIMEOUT_MS)
  })

  try {
    // SELECT 1 เปล่า ๆ พอ — ไม่แตะตารางไหนเลย จึงไม่พังตอน migration ยังไม่ครบ
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const startedAt = Date.now()

  try {
    await pingDatabase()
  } catch (error) {
    // log ฝั่ง server ได้เต็ม ๆ แต่ response ห้ามมีรายละเอียดฐานข้อมูล — endpoint นี้เปิด public
    console.error("[health] ต่อฐานข้อมูลไม่ได้:", error)
    return NextResponse.json(
      {
        status: "error",
        database: "down",
        message: "ระบบฐานข้อมูลไม่ตอบสนอง",
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.json(
    {
      status: "ok",
      database: "up",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  )
}
