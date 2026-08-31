import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("ไม่พบ DATABASE_URL — ตรวจไฟล์ .env ก่อนรัน seed")

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const PRODUCTS = [
  { sku: "SKU-1001", name: "ปากกาลูกลื่น สีน้ำเงิน", category: "เครื่องเขียน", unit: "ด้าม", quantity: 120, reorderPoint: 30, price: "5.00" },
  { sku: "SKU-1002", name: "สมุดโน้ต A5 80 แผ่น", category: "เครื่องเขียน", unit: "เล่ม", quantity: 45, reorderPoint: 20, price: "35.00" },
  { sku: "SKU-1003", name: "กระดาษ A4 80 แกรม", category: "เครื่องเขียน", unit: "รีม", quantity: 18, reorderPoint: 20, price: "125.00" },
  { sku: "SKU-1004", name: "หลอดไฟ LED 9W", category: "อุปกรณ์ไฟฟ้า", unit: "หลอด", quantity: 60, reorderPoint: 15, price: "89.00" },
  { sku: "SKU-1005", name: "ปลั๊กพ่วง 5 ช่อง 3 เมตร", category: "อุปกรณ์ไฟฟ้า", unit: "อัน", quantity: 8, reorderPoint: 10, price: "290.00" },
  { sku: "SKU-1006", name: "น้ำยาทำความสะอาดพื้น 3.8 ลิตร", category: "ของใช้ทั่วไป", unit: "แกลลอน", quantity: 24, reorderPoint: 8, price: "165.00" },
  { sku: "SKU-1007", name: "ถุงขยะดำ 30x40 นิ้ว", category: "ของใช้ทั่วไป", unit: "แพ็ค", quantity: 5, reorderPoint: 12, price: "75.00" },
]

async function main() {
  console.info("กำลัง seed ข้อมูลตัวอย่าง…")

  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {},
      create: product,
    })
  }

  // ledger ตั้งต้นให้ยอดคงเหลือมีที่มา — สร้างเฉพาะตอนยังไม่มีรายการใด ๆ
  const existing = await prisma.stockTransaction.count()
  if (existing === 0) {
    const created = await prisma.product.findMany({ select: { id: true, quantity: true } })
    await prisma.stockTransaction.createMany({
      data: created.map((p) => ({
        productId: p.id,
        type: "IN" as const,
        quantity: p.quantity,
        note: "ยอดยกมาตั้งต้น (seed)",
      })),
    })
  }

  const total = await prisma.product.count()
  console.info(`seed เรียบร้อย — มีสินค้าทั้งหมด ${total} รายการ`)
}

main()
  .catch((error) => {
    console.error("seed ล้มเหลว:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
