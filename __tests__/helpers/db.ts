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
  // ลบตามลำดับ FK — sale_item/stock_transaction อ้าง sale กับ product, cashier_closing อ้าง user
  // ตารางฝั่ง MJD Mobile Order ต้องล้างด้วย ไม่งั้นโต๊ะ/เมนูจากเทสก่อนหน้าค้างข้ามไฟล์
  await db.$executeRawUnsafe(
    [
      "TRUNCATE TABLE",
      '"sale_item", "stock_transaction", "cashier_closing", "member_point_transaction", "sale",',
      '"mobile_order_item", "mobile_order", "notification", "line_notification_log", "table_session",',
      '"qr_code", "restaurant_table", "modifier_option", "modifier_group", "menu_item",',
      '"member", "store_settings", "product", "category",',
      // ตารางสิทธิ์ (§4) — ต้องล้างด้วย ไม่งั้นบทบาทจากเทสก่อนหน้าค้างแล้วชนกับ unique ของชื่อบทบาท
      '"role_permission", "role"',
      "RESTART IDENTITY CASCADE",
    ].join(" "),
  )
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
      category: {
        connectOrCreate: {
          where: { name: input.category ?? "เครื่องปรุง" },
          create: { name: input.category ?? "เครื่องปรุง" },
        },
      },
      unit: input.unit ?? "ขวด",
      quantity: input.quantity ?? 0,
      reorderPoint: input.reorderPoint ?? 0,
      price: input.price ?? "120.00",
    },
  })
}

/// ทุก resource พร้อม action ที่ resource นั้นรองรับจริง (ตรงกับ RESOURCE_ACTIONS ใน §4)
const FULL_PERMISSIONS = [
  { resource: "DASHBOARD", actions: ["VIEW"] },
  { resource: "PRODUCTS", actions: ["VIEW", "ADD", "EDIT", "DELETE"] },
  { resource: "CATEGORIES", actions: ["VIEW", "ADD", "EDIT", "DELETE"] },
  { resource: "STOCK_IN", actions: ["VIEW", "ADD"] },
  { resource: "STOCK_OUT", actions: ["VIEW", "ADD"] },
  { resource: "POS", actions: ["VIEW", "ADD"] },
  { resource: "POS_HISTORY", actions: ["VIEW", "DELETE"] },
  { resource: "POS_CLOSING", actions: ["VIEW", "ADD"] },
  { resource: "REPORTS", actions: ["VIEW"] },
  { resource: "USERS", actions: ["VIEW", "ADD", "EDIT", "DELETE"] },
] as const

/// บทบาทเต็มสิทธิ์สำหรับเทสที่สนใจ "ตรรกะธุรกิจ" ไม่ใช่ "ระบบสิทธิ์"
/// เทสที่ทดสอบระบบสิทธิ์เองให้ส่ง `{ withFullPermissions: false }` แล้วผูกบทบาทเอง
export async function giveFullPermissions(userId: string) {
  const db = testPrisma()
  const role = await db.role.upsert({
    where: { name: "เต็มสิทธิ์ (เทส)" },
    update: {},
    create: {
      name: "เต็มสิทธิ์ (เทส)",
      permissions: {
        create: FULL_PERMISSIONS.map((row) => ({
          resource: row.resource as never,
          actions: [...row.actions] as never,
        })),
      },
    },
    select: { id: true },
  })
  await db.user.update({ where: { id: userId }, data: { roleId: role.id } })
  return role.id
}

/// Sale.cashierId เป็น FK ไปตาราง user — ต้องมีผู้ใช้ทดสอบอยู่จริงก่อนสร้างบิล
export async function ensureTestUser(
  id = "test-user",
  name = "ผู้ทดสอบ",
  options: { withFullPermissions?: boolean } = {},
) {
  const db = testPrisma()
  const user = await db.user.upsert({
    where: { id },
    update: {},
    create: { id, name, email: `${id}@example.com`, emailVerified: true },
  })
  // ให้สิทธิ์เต็มโดยปริยาย — ก่อนมี §4 ผู้ใช้ทุกคนทำได้ทุกอย่างอยู่แล้ว
  // เทสเดิมจึงยังวัดสิ่งที่ตั้งใจวัด (ตรรกะธุรกิจ) ไม่ใช่ไปติดด่านสิทธิ์แทน
  if (options.withFullPermissions ?? true) await giveFullPermissions(id)
  return user
}

export async function createTestCategory(name = "หมวดทดสอบ") {
  const db = testPrisma()
  return db.category.upsert({ where: { name }, update: {}, create: { name } })
}

let tableCounter = 0

export async function createTestTable(code?: string) {
  tableCounter += 1
  const db = testPrisma()
  return db.table.create({ data: { code: code ?? `T${String(tableCounter).padStart(2, "0")}` } })
}

export async function createTestQrCode(
  tableId: string,
  input: { token?: string; type?: "STATIC" | "DYNAMIC"; status?: "ACTIVE" | "INVALIDATED" } = {},
) {
  const db = testPrisma()
  return db.qRCode.create({
    data: {
      tableId,
      token: input.token ?? `qr-${Math.random().toString(36).slice(2, 12)}`,
      type: input.type ?? "STATIC",
      status: input.status ?? "ACTIVE",
    },
  })
}

export async function createTestMenuItem(input: { name?: string; price?: string } = {}) {
  const db = testPrisma()
  return db.menuItem.create({
    data: { name: input.name ?? "ข้าวกะเพราทดสอบ", price: input.price ?? "80.00" },
  })
}

/// StoreSettings เป็น singleton — เทสที่แตะเส้นทางครัวต้องตั้งค่า hasKDS ก่อนเสมอ
export async function setStoreSettings(input: { hasKDS?: boolean; serviceChargePercent?: string } = {}) {
  const db = testPrisma()
  return db.storeSettings.upsert({
    where: { id: "default" },
    update: {
      ...(input.hasKDS === undefined ? {} : { hasKDS: input.hasKDS }),
      ...(input.serviceChargePercent === undefined
        ? {}
        : { serviceChargePercent: input.serviceChargePercent }),
    },
    create: {
      id: "default",
      storeName: "ร้านทดสอบ",
      themeColor: "#E8571F",
      hasKDS: input.hasKDS ?? false,
      serviceChargePercent: input.serviceChargePercent ?? "0.00",
    },
  })
}

export async function createTestOrder(sessionId: string, orderNumber = 1) {
  const db = testPrisma()
  return db.mobileOrder.create({ data: { tableSessionId: sessionId, orderNumber } })
}

export async function createTestOrderItem(
  orderId: string,
  menuItemId: string,
  input: { quantity?: number; unitPrice?: string; status?: "AWAITING_KITCHEN" | "COOKING" | "READY" } = {},
) {
  const db = testPrisma()
  return db.mobileOrderItem.create({
    data: {
      mobileOrderId: orderId,
      menuItemId,
      quantity: input.quantity ?? 1,
      unitPrice: input.unitPrice ?? "80.00",
      status: input.status ?? "AWAITING_KITCHEN",
    },
  })
}
