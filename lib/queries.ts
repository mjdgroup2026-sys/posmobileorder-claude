import "server-only"
import { prisma } from "@/lib/prisma"
import { toNumber } from "@/lib/format"

export type ProductListItem = {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  quantity: number
  reorderPoint: number
  price: number
  isLow: boolean
}

export async function listProducts(params: { search?: string; category?: string } = {}) {
  const search = params.search?.trim()
  const category = params.category?.trim()

  const rows = await prisma.product.findMany({
    where: {
      ...(category && category !== "all" ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  })

  return rows.map<ProductListItem>((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    unit: p.unit,
    quantity: p.quantity,
    reorderPoint: p.reorderPoint,
    price: toNumber(p.price),
    isLow: p.quantity <= p.reorderPoint,
  }))
}

export async function listProductOptions() {
  const rows = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, unit: true, quantity: true },
  })
  return rows
}

export async function listCategories() {
  const rows = await prisma.product.findMany({
    distinct: ["category"],
    orderBy: { category: "asc" },
    select: { category: true },
  })
  return rows.map((r) => r.category)
}

export async function getLowStockCount() {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "product" WHERE "quantity" <= "reorderPoint"
  `
  return Number(rows[0]?.count ?? 0)
}

export async function getLowStockProducts(limit = 50) {
  const rows = await prisma.$queryRaw<
    { id: string; sku: string; name: string; unit: string; quantity: number; reorderPoint: number }[]
  >`
    SELECT "id", "sku", "name", "unit", "quantity", "reorderPoint"
    FROM "product"
    WHERE "quantity" <= "reorderPoint"
    ORDER BY ("quantity" - "reorderPoint") ASC, "name" ASC
    LIMIT ${limit}
  `
  return rows
}

export async function getDashboardStats() {
  const [productCount, agg, lowStockCount] = await Promise.all([
    prisma.product.count(),
    prisma.$queryRaw<{ total: string | null }[]>`
      SELECT COALESCE(SUM("quantity" * "price"), 0)::text AS total FROM "product"
    `,
    getLowStockCount(),
  ])

  return {
    productCount,
    stockValue: toNumber(agg[0]?.total ?? 0),
    lowStockCount,
  }
}

export async function getRecentTransactions(limit = 8) {
  const rows = await prisma.stockTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { product: { select: { name: true, sku: true, unit: true } } },
  })
  return rows.map((t) => ({
    id: t.id,
    type: t.type,
    quantity: t.quantity,
    note: t.note,
    createdAt: t.createdAt,
    productName: t.product.name,
    productSku: t.product.sku,
    unit: t.product.unit,
  }))
}

export async function listTransactions(limit = 100) {
  const rows = await prisma.stockTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { product: { select: { name: true, sku: true, unit: true } } },
  })
  return rows.map((t) => ({
    id: t.id,
    type: t.type,
    quantity: t.quantity,
    note: t.note,
    createdAt: t.createdAt,
    productName: t.product.name,
    productSku: t.product.sku,
    unit: t.product.unit,
  }))
}

/// สรุปการเคลื่อนไหว 30 วันย้อนหลัง สำหรับหน้า /reports
export async function getMovementReport() {
  const rows = await prisma.$queryRaw<{ day: Date; type: string; total: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, "type", SUM("quantity")::bigint AS total
    FROM "stock_transaction"
    WHERE "createdAt" >= now() - interval '30 days'
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `

  const byDay = new Map<string, { day: string; stockIn: number; stockOut: number }>()
  for (const r of rows) {
    const key = new Date(r.day).toISOString().slice(0, 10)
    const entry = byDay.get(key) ?? { day: key, stockIn: 0, stockOut: 0 }
    if (r.type === "IN") entry.stockIn = Number(r.total)
    else entry.stockOut = Number(r.total)
    byDay.set(key, entry)
  }

  return Array.from(byDay.values())
}

export async function getTopMovedProducts(limit = 5) {
  const rows = await prisma.$queryRaw<{ name: string; sku: string; total: bigint }[]>`
    SELECT p."name", p."sku", SUM(t."quantity")::bigint AS total
    FROM "stock_transaction" t
    JOIN "product" p ON p."id" = t."productId"
    WHERE t."type" = 'OUT' AND t."createdAt" >= now() - interval '30 days'
    GROUP BY p."name", p."sku"
    ORDER BY total DESC
    LIMIT ${limit}
  `
  return rows.map((r) => ({ name: r.name, sku: r.sku, total: Number(r.total) }))
}

export async function listUsers() {
  const rows = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
  })
  return rows
}
