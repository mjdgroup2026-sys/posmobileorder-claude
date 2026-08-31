import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"

/// ค่า DATABASE_URL ถูกโหลดจาก .env.test ใน __tests__/setup.ts (override: true)
function databaseUrl(): string {
  return process.env.DATABASE_URL ?? ""
}

/// กันพลาดยิงลงฐาน dev — ชื่อฐานของเทสต้องลงท้ายด้วย _test เท่านั้น
export function assertTestDatabase(): void {
  const url = databaseUrl()
  if (!url) {
    throw new Error("ไม่พบ DATABASE_URL สำหรับเทส — สร้างไฟล์ .env.test ก่อน (ดู README ของเทส)")
  }
  const name = new URL(url).pathname.replace(/^\//, "")
  if (!name.endsWith("_test")) {
    throw new Error(`ฐานข้อมูลของเทสต้องลงท้ายด้วย _test แต่ได้ "${name}" — ห้ามยิงลงฐาน dev`)
  }
}

let client: PrismaClient | undefined

export function testPrisma(): PrismaClient {
  assertTestDatabase()
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) })
  }
  return client
}

/// เช็คว่าต่อฐานเทสได้จริงไหม (Docker ปิดอยู่ / ยังไม่ได้สร้างฐาน → false)
export async function isTestDbReachable(): Promise<boolean> {
  try {
    const db = testPrisma()
    await db.$queryRaw`SELECT 1`
    await db.$queryRaw`SELECT 1 FROM "product" LIMIT 1`
    return true
  } catch {
    return false
  }
}

export async function disconnectTestDb(): Promise<void> {
  if (client) {
    await client.$disconnect()
    client = undefined
  }
}

/// ล้างข้อมูลก่อนทุกเทส — ledger เป็น append-only ในโค้ด production
/// การ TRUNCATE ที่นี่ทำได้เฉพาะกับฐาน _test เท่านั้น (assertTestDatabase กันไว้)
export async function resetDb(): Promise<void> {
  const db = testPrisma()
  await db.$executeRawUnsafe('TRUNCATE TABLE "stock_transaction", "product" RESTART IDENTITY CASCADE')
}

let skuCounter = 1000

type TestProductInput = {
  sku?: string
  name?: string
  category?: string
  unit?: string
  quantity?: number
  reorderPoint?: number
  price?: string
}

export async function createTestProduct(input: TestProductInput = {}) {
  skuCounter += 1
  const db = testPrisma()
  return db.product.create({
    data: {
      sku: input.sku ?? `SKU-${skuCounter}`,
      name: input.name ?? "น้ำปลาทดสอบ",
      category: input.category ?? "เครื่องปรุง",
      unit: input.unit ?? "ขวด",
      quantity: input.quantity ?? 0,
      reorderPoint: input.reorderPoint ?? 0,
      price: input.price ?? "120.00",
    },
  })
}
