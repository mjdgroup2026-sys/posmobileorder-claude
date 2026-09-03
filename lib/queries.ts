import "server-only"
import { prisma } from "@/lib/prisma"
import { toNumber } from "@/lib/format"
import { businessDayRange, businessDateOnly } from "@/lib/day"
import type { PaymentMethodValue } from "@/lib/types"

export type ProductListItem = {
  id: string
  sku: string
  name: string
  categoryId: string
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
      ...(category && category !== "all" ? { categoryId: category } : {}),
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
    include: { category: { select: { name: true } } },
  })

  return rows.map<ProductListItem>((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    categoryId: p.categoryId,
    category: p.category.name,
    unit: p.unit,
    quantity: p.quantity,
    reorderPoint: p.reorderPoint,
    price: toNumber(p.price),
    isLow: p.quantity <= p.reorderPoint,
  }))
}

export type ProductOption = {
  id: string
  sku: string
  name: string
  unit: string
  quantity: number
  price: number
  categoryId: string
  category: string
}

export async function listProductOptions(): Promise<ProductOption[]> {
  const rows = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      quantity: true,
      price: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  })
  return rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
    quantity: p.quantity,
    price: toNumber(p.price),
    categoryId: p.categoryId,
    category: p.category.name,
  }))
}

/// หมวดหมู่ทั้งหมด (master data) — ใช้เป็นตัวเลือกใน dropdown ทุกหน้า
export async function listCategoryOptions() {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

/// หมวดหมู่พร้อมจำนวนสินค้าที่ผูกอยู่ — หน้า /categories ใช้ตัดสินใจว่าลบได้ไหม
export async function listCategoriesWithCount() {
  const rows = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { products: true } },
    },
  })
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    createdAt: c.createdAt,
    productCount: c._count.products,
  }))
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
  const { start, end } = businessDayRange()

  const [productCount, agg, lowStockCount, todaySales] = await Promise.all([
    prisma.product.count(),
    prisma.$queryRaw<{ total: string | null }[]>`
      SELECT COALESCE(SUM("quantity" * "price"), 0)::text AS total FROM "product"
    `,
    getLowStockCount(),
    prisma.sale.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ])

  return {
    productCount,
    stockValue: toNumber(agg[0]?.total ?? 0),
    lowStockCount,
    todaySalesTotal: toNumber(todaySales._sum.total ?? 0),
    todayBillCount: todaySales._count._all,
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

// ───────────────────────────── POS (Phase 2.5) ─────────────────────────────

export type SaleListItem = {
  id: string
  saleNumber: string
  status: "COMPLETED" | "VOIDED"
  subtotal: number
  discount: number
  total: number
  paymentMethod: PaymentMethodValue
  amountReceived: number
  changeDue: number
  note: string | null
  createdAt: Date
  cashierName: string
  voidedAt: Date | null
  voidReason: string | null
  voidedByName: string | null
  canVoid: boolean
  items: {
    id: string
    name: string
    sku: string
    unit: string
    quantity: number
    unitPrice: number
    subtotal: number
  }[]
}

/// บิลขายพร้อมรายการสินค้า — หน้า /pos/history ใช้ทั้งตารางและ dialog รายละเอียด
export async function listSales(
  params: { from?: string; to?: string; status?: string; search?: string; limit?: number } = {},
): Promise<SaleListItem[]> {
  const status = params.status === "COMPLETED" || params.status === "VOIDED" ? params.status : undefined
  const from = params.from ? new Date(`${params.from}T00:00:00.000+07:00`) : undefined
  // to เป็นวันที่แบบ inclusive — บวกอีกวันแล้วใช้ lt เพื่อกินทั้งวันสุดท้าย
  const to = params.to ? new Date(new Date(`${params.to}T00:00:00.000+07:00`).getTime() + 86_400_000) : undefined
  const search = params.search?.trim()

  const rows = await prisma.sale.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...(search ? { saleNumber: { contains: search, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 200,
    include: {
      cashier: { select: { name: true } },
      voidedBy: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true, unit: true } } } },
    },
  })

  const { start, end } = businessDayRange()
  // ปิดยอดของแคชเชียร์คนไหนไปแล้วบ้างในวันนี้ — บิลของคนนั้นกด void ไม่ได้อีก (F9)
  const closings = await prisma.cashierClosing.findMany({
    where: { closingDate: businessDateOnly() },
    select: { cashierId: true },
  })
  const closedCashiers = new Set(closings.map((c) => c.cashierId))

  return rows.map((sale) => ({
    id: sale.id,
    saleNumber: sale.saleNumber,
    status: sale.status,
    subtotal: toNumber(sale.subtotal),
    discount: toNumber(sale.discount),
    total: toNumber(sale.total),
    paymentMethod: sale.paymentMethod,
    amountReceived: toNumber(sale.amountReceived),
    changeDue: toNumber(sale.changeDue),
    note: sale.note,
    createdAt: sale.createdAt,
    cashierName: sale.cashier.name,
    voidedAt: sale.voidedAt,
    voidReason: sale.voidReason,
    voidedByName: sale.voidedBy?.name ?? null,
    canVoid:
      sale.status === "COMPLETED" &&
      sale.createdAt >= start &&
      sale.createdAt < end &&
      !closedCashiers.has(sale.cashierId),
    items: sale.items.map((item) => ({
      id: item.id,
      name: item.product.name,
      sku: item.product.sku,
      unit: item.product.unit,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      subtotal: toNumber(item.subtotal),
    })),
  }))
}

export async function getSaleById(id: string): Promise<SaleListItem | null> {
  const sale = await prisma.sale.findUnique({ where: { id }, select: { saleNumber: true } })
  if (!sale) return null
  const rows = await listSales({ search: sale.saleNumber, limit: 1 })
  return rows[0] ?? null
}

export async function getRecentSales(limit = 6) {
  const rows = await prisma.sale.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { cashier: { select: { name: true } }, _count: { select: { items: true } } },
  })
  return rows.map((s) => ({
    id: s.id,
    saleNumber: s.saleNumber,
    status: s.status,
    total: toNumber(s.total),
    paymentMethod: s.paymentMethod,
    createdAt: s.createdAt,
    cashierName: s.cashier.name,
    itemCount: s._count.items,
  }))
}

/// ยอดขายรายวันย้อนหลัง 30 วัน (นับเฉพาะบิล COMPLETED)
export async function getSalesReport() {
  const rows = await prisma.$queryRaw<{ day: Date; total: string; bills: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day,
           COALESCE(SUM("total"), 0)::text AS total,
           COUNT(*)::bigint AS bills
    FROM "sale"
    WHERE "status" = 'COMPLETED' AND "createdAt" >= now() - interval '30 days'
    GROUP BY 1
    ORDER BY 1 ASC
  `
  return rows.map((r) => ({
    day: new Date(r.day).toISOString().slice(0, 10),
    total: toNumber(r.total),
    bills: Number(r.bills),
  }))
}

export async function getTopSellingProducts(limit = 5) {
  const rows = await prisma.$queryRaw<{ name: string; sku: string; qty: bigint; revenue: string }[]>`
    SELECT p."name", p."sku",
           SUM(i."quantity")::bigint AS qty,
           COALESCE(SUM(i."subtotal"), 0)::text AS revenue
    FROM "sale_item" i
    JOIN "sale" s ON s."id" = i."saleId"
    JOIN "product" p ON p."id" = i."productId"
    WHERE s."status" = 'COMPLETED' AND s."createdAt" >= now() - interval '30 days'
    GROUP BY p."name", p."sku"
    ORDER BY qty DESC
    LIMIT ${limit}
  `
  return rows.map((r) => ({
    name: r.name,
    sku: r.sku,
    quantity: Number(r.qty),
    revenue: toNumber(r.revenue),
  }))
}

export async function getPaymentBreakdown() {
  const rows = await prisma.sale.groupBy({
    by: ["paymentMethod"],
    where: { status: "COMPLETED", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    _sum: { total: true },
    _count: { _all: true },
  })
  return rows.map((r) => ({
    paymentMethod: r.paymentMethod as PaymentMethodValue,
    total: toNumber(r._sum.total ?? 0),
    bills: r._count._all,
  }))
}

export type ClosingSummary = {
  totalSales: number
  totalCash: number
  totalTransfer: number
  totalQR: number
  billCount: number
  voidedCount: number
}

/// สรุปยอดวันนี้ของแคชเชียร์คนหนึ่ง — คำนวณสดจาก Sale จริงเสมอ ไม่มีการกรอกเอง
export async function getTodaySalesSummary(cashierId: string): Promise<ClosingSummary> {
  const { start, end } = businessDayRange()

  const [byMethod, voidedCount] = await Promise.all([
    prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: { cashierId, status: "COMPLETED", createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.sale.count({ where: { cashierId, status: "VOIDED", voidedAt: { gte: start, lt: end } } }),
  ])

  const summary: ClosingSummary = {
    totalSales: 0,
    totalCash: 0,
    totalTransfer: 0,
    totalQR: 0,
    billCount: 0,
    voidedCount,
  }

  for (const row of byMethod) {
    const value = toNumber(row._sum.total ?? 0)
    summary.totalSales += value
    summary.billCount += row._count._all
    if (row.paymentMethod === "CASH") summary.totalCash += value
    else if (row.paymentMethod === "TRANSFER") summary.totalTransfer += value
    else summary.totalQR += value
  }

  return summary
}

export async function getTodayClosing(cashierId: string) {
  const row = await prisma.cashierClosing.findUnique({
    where: { cashierId_closingDate: { cashierId, closingDate: businessDateOnly() } },
  })
  if (!row) return null
  return {
    id: row.id,
    closingDate: row.closingDate,
    totalSales: toNumber(row.totalSales),
    totalCash: toNumber(row.totalCash),
    totalTransfer: toNumber(row.totalTransfer),
    totalQR: toNumber(row.totalQR),
    billCount: row.billCount,
    voidedCount: row.voidedCount,
    countedCash: toNumber(row.countedCash),
    difference: toNumber(row.difference),
    note: row.note,
    closedAt: row.closedAt,
  }
}

export async function listClosings(params: { cashierId?: string; limit?: number } = {}) {
  const rows = await prisma.cashierClosing.findMany({
    where: params.cashierId ? { cashierId: params.cashierId } : {},
    orderBy: [{ closingDate: "desc" }, { closedAt: "desc" }],
    take: params.limit ?? 60,
    include: { cashier: { select: { name: true } } },
  })
  return rows.map((row) => ({
    id: row.id,
    cashierName: row.cashier.name,
    closingDate: row.closingDate,
    totalSales: toNumber(row.totalSales),
    totalCash: toNumber(row.totalCash),
    totalTransfer: toNumber(row.totalTransfer),
    totalQR: toNumber(row.totalQR),
    billCount: row.billCount,
    voidedCount: row.voidedCount,
    countedCash: toNumber(row.countedCash),
    difference: toNumber(row.difference),
    note: row.note,
    closedAt: row.closedAt,
  }))
}

// ───────────────────── MJD Mobile Order (Phase 6–7) ─────────────────────

export type TableCardStatus =
  | "EMPTY"
  | "OPEN_NO_ORDER"
  | "ORDERED"
  | "AWAITING_BILL"
  | "OCCUPIED_MERGED"

export type TableCard = {
  id: string
  code: string
  status: TableCardStatus
  sessionId: string | null
  /// เวลาเปิดโต๊ะ — หน้า UI คำนวณ "เปิดมาแล้วกี่นาที" สดจากค่านี้ทุกครั้งที่ render (ห้ามเก็บเป็นฟิลด์)
  openedAt: Date | null
  total: number
  itemCount: number
  primaryTableId: string | null
  primaryTableCode: string | null
  mergedTableCodes: string[]
  pendingNotification: { id: string; type: "CALL_STAFF" | "CHECK_BILL"; reason: string | null } | null
}

/// ยอดสดต่อ session (ไม่รวมรายการที่ยกเลิก) — ใช้ raw SQL เพราะ Prisma groupBy ข้ามความสัมพันธ์ไม่ได้
/// ⚠️ raw SQL ไม่ผ่าน @@map — ชื่อตารางต้องเป็นชื่อจริงในฐาน (table_session, mobile_order, …)
async function liveSessionTotals() {
  const rows = await prisma.$queryRaw<{ sessionId: string; total: string; items: bigint }[]>`
    SELECT s."id" AS "sessionId",
           COALESCE(SUM(i."unitPrice" * i."quantity"), 0)::text AS total,
           COUNT(i."id")::bigint AS items
    FROM "table_session" s
    LEFT JOIN "mobile_order" o ON o."tableSessionId" = s."id"
    LEFT JOIN "mobile_order_item" i ON i."mobileOrderId" = o."id" AND i."status" <> 'CANCELLED'
    WHERE s."status" IN ('OPEN', 'AWAITING_BILL')
    GROUP BY s."id"
  `
  return new Map(rows.map((r) => [r.sessionId, { total: toNumber(r.total), items: Number(r.items) }]))
}

export async function listTableOverview(): Promise<TableCard[]> {
  const [tables, sessions, totals, notifications] = await Promise.all([
    prisma.table.findMany({ orderBy: { code: "asc" } }),
    prisma.tableSession.findMany({
      where: { status: { in: ["OPEN", "AWAITING_BILL"] } },
      orderBy: { openedAt: "desc" },
      select: { id: true, tableId: true, openedAt: true, status: true },
    }),
    liveSessionTotals(),
    prisma.notification.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, reason: true, tableSessionId: true },
    }),
  ])

  const sessionByTable = new Map(sessions.map((s) => [s.tableId, s]))
  const notificationBySession = new Map<string, (typeof notifications)[number]>()
  for (const n of notifications) {
    if (!notificationBySession.has(n.tableSessionId)) notificationBySession.set(n.tableSessionId, n)
  }
  const codeById = new Map(tables.map((t) => [t.id, t.code]))
  const mergedByPrimary = new Map<string, string[]>()
  for (const t of tables) {
    if (!t.primaryTableId) continue
    mergedByPrimary.set(t.primaryTableId, [...(mergedByPrimary.get(t.primaryTableId) ?? []), t.code])
  }

  return tables.map<TableCard>((t) => {
    const session = sessionByTable.get(t.id) ?? null
    const totalsRow = session ? totals.get(session.id) : undefined
    const notification = session ? (notificationBySession.get(session.id) ?? null) : null

    return {
      id: t.id,
      code: t.code,
      status: t.status,
      sessionId: session?.id ?? null,
      openedAt: session?.openedAt ?? null,
      total: totalsRow?.total ?? 0,
      itemCount: totalsRow?.items ?? 0,
      primaryTableId: t.primaryTableId,
      primaryTableCode: t.primaryTableId ? (codeById.get(t.primaryTableId) ?? null) : null,
      mergedTableCodes: mergedByPrimary.get(t.id) ?? [],
      pendingNotification: notification
        ? { id: notification.id, type: notification.type, reason: notification.reason }
        : null,
    }
  })
}

export type NotificationCard = {
  id: string
  type: "CALL_STAFF" | "CHECK_BILL"
  reason: string | null
  status: "PENDING" | "ACKNOWLEDGED"
  createdAt: Date
  acknowledgedAt: Date | null
  acknowledgedByName: string | null
  tableId: string
  tableCode: string
  /// เวลาเปิดโต๊ะของ session ที่แจ้งเตือนมา — คนละอันกับ createdAt ของการแจ้งเตือนเอง (F12)
  openedAt: Date
  sessionTotal: number
}

export async function listNotifications(limit = 60): Promise<NotificationCard[]> {
  const [rows, totals] = await Promise.all([
    prisma.notification.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        acknowledgedBy: { select: { name: true } },
        session: {
          select: {
            id: true,
            openedAt: true,
            table: { select: { id: true, code: true } },
          },
        },
      },
    }),
    liveSessionTotals(),
  ])

  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    reason: n.reason,
    status: n.status,
    createdAt: n.createdAt,
    acknowledgedAt: n.acknowledgedAt,
    acknowledgedByName: n.acknowledgedBy?.name ?? null,
    tableId: n.session.table.id,
    tableCode: n.session.table.code,
    openedAt: n.session.openedAt,
    sessionTotal: totals.get(n.session.id)?.total ?? 0,
  }))
}

export async function getPendingNotificationCount() {
  return prisma.notification.count({ where: { status: "PENDING" } })
}

export type OrderItemRow = {
  id: string
  menuItemName: string
  quantity: number
  unitPrice: number
  subtotal: number
  note: string | null
  status: "AWAITING_KITCHEN" | "COOKING" | "READY" | "SERVED" | "CANCELLED"
  options: { groupName: string; optionName: string; priceDelta: number }[]
  cancelReason: string | null
}

export type TableDetail = {
  tableId: string
  tableCode: string
  status: TableCardStatus
  sessionId: string
  openedAt: Date
  sessionStatus: "OPEN" | "AWAITING_BILL" | "CLOSED" | "CANCELLED"
  qrType: "STATIC" | "DYNAMIC" | null
  mergedTableCodes: string[]
  total: number
  hasKDS: boolean
  orders: {
    id: string
    orderNumber: number
    submittedAt: Date
    printedAt: Date | null
    items: OrderItemRow[]
  }[]
  notifications: { id: string; type: "CALL_STAFF" | "CHECK_BILL"; reason: string | null; createdAt: Date }[]
}

/// แปลง JSON snapshot ของ modifier ให้เป็นรูปแบบที่หน้าจอใช้ได้ — ข้อมูลเก่าอาจว่างหรือผิดรูป
function parseOptions(raw: unknown): { groupName: string; optionName: string; priceDelta: number }[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return []
    const record = entry as Record<string, unknown>
    if (typeof record.optionName !== "string") return []
    return [
      {
        groupName: typeof record.groupName === "string" ? record.groupName : "",
        optionName: record.optionName,
        priceDelta: toNumber(record.priceDelta ?? 0),
      },
    ]
  })
}

export async function getTableDetail(tableId: string): Promise<TableDetail | null> {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    select: { id: true, code: true, status: true, primaryTableId: true },
  })
  if (!table) return null

  // โต๊ะรองไม่มี session ของตัวเอง — ทุกอย่างอยู่ที่โต๊ะหลัก
  const targetId = table.primaryTableId ?? table.id

  const [session, settings, merged] = await Promise.all([
    prisma.tableSession.findFirst({
      where: { tableId: targetId, status: { in: ["OPEN", "AWAITING_BILL"] } },
      orderBy: { openedAt: "desc" },
      include: {
        table: { select: { id: true, code: true, status: true } },
        qrCode: { select: { type: true } },
        orders: {
          orderBy: { orderNumber: "asc" },
          include: {
            items: {
              orderBy: { createdAt: "asc" },
              include: { menuItem: { select: { name: true } } },
            },
          },
        },
        notifications: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, reason: true, createdAt: true },
        },
      },
    }),
    prisma.storeSettings.findUnique({ where: { id: "default" }, select: { hasKDS: true } }),
    prisma.table.findMany({ where: { primaryTableId: targetId }, select: { code: true } }),
  ])

  if (!session) return null

  const orders = session.orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    submittedAt: order.submittedAt,
    printedAt: order.printedAt,
    items: order.items.map<OrderItemRow>((item) => ({
      id: item.id,
      menuItemName: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      subtotal: toNumber(item.unitPrice) * item.quantity,
      note: item.note,
      status: item.status,
      options: parseOptions(item.selectedOptionsSnapshot),
      cancelReason: item.cancelReason,
    })),
  }))

  const total = orders
    .flatMap((o) => o.items)
    .filter((i) => i.status !== "CANCELLED")
    .reduce((sum, i) => sum + i.subtotal, 0)

  return {
    tableId: session.table.id,
    tableCode: session.table.code,
    status: session.table.status,
    sessionId: session.id,
    openedAt: session.openedAt,
    sessionStatus: session.status,
    qrType: session.qrCode?.type ?? null,
    mergedTableCodes: merged.map((m) => m.code),
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    hasKDS: settings?.hasKDS ?? false,
    orders,
  notifications: session.notifications,
  }
}

export type KitchenTicket = {
  orderId: string
  orderNumber: number
  tableCode: string
  submittedAt: Date
  printedAt: Date | null
  items: OrderItemRow[]
}

/// ทิกเก็ตครัว — รวมเฉพาะรายการที่ยังไม่จบ (ยกเลิก/เสิร์ฟแล้วไม่ต้องแสดงบน KDS)
export async function listKitchenTickets(): Promise<KitchenTicket[]> {
  const orders = await prisma.mobileOrder.findMany({
    where: {
      session: { status: { in: ["OPEN", "AWAITING_BILL"] } },
      items: { some: { status: { in: ["AWAITING_KITCHEN", "COOKING", "READY"] } } },
    },
    orderBy: { submittedAt: "asc" },
    include: {
      session: { select: { table: { select: { code: true } } } },
      items: {
        where: { status: { in: ["AWAITING_KITCHEN", "COOKING", "READY"] } },
        orderBy: { createdAt: "asc" },
        include: { menuItem: { select: { name: true } } },
      },
    },
  })

  return orders.map((order) => ({
    orderId: order.id,
    orderNumber: order.orderNumber,
    tableCode: order.session.table.code,
    submittedAt: order.submittedAt,
    printedAt: order.printedAt,
    items: order.items.map<OrderItemRow>((item) => ({
      id: item.id,
      menuItemName: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      subtotal: toNumber(item.unitPrice) * item.quantity,
      note: item.note,
      status: item.status,
      options: parseOptions(item.selectedOptionsSnapshot),
      cancelReason: item.cancelReason,
    })),
  }))
}

export async function getStoreSettings() {
  const settings = await prisma.storeSettings.findUnique({ where: { id: "default" } })
  if (!settings) return null
  return {
    id: settings.id,
    storeName: settings.storeName,
    logoUrl: settings.logoUrl,
    coverImageUrl: settings.coverImageUrl,
    themeColor: settings.themeColor,
    hasKDS: settings.hasKDS,
    serviceChargePercent: toNumber(settings.serviceChargePercent),
    crmEnabled: settings.crmEnabled,
  }
}

// ───────────────────── ฝั่งลูกค้า (Phase 9) ─────────────────────

export type CustomerSession =
  | { ok: true; sessionId: string; tableId: string; tableCode: string; openedAt: Date; awaitingBill: boolean }
  | { ok: false; reason: "QR_NOT_FOUND" | "QR_INVALIDATED" | "NO_SESSION" }

/// แปลง QR token เป็น session ที่ใช้งานอยู่ — ทุกหน้าฝั่งลูกค้าเรียกตัวนี้ก่อนเสมอ
/// ไม่สร้าง session ใหม่ที่นี่ (การสร้างอยู่ที่ server action `openTableSession` เท่านั้น)
export async function resolveCustomerSession(qrToken: string): Promise<CustomerSession> {
  const qr = await prisma.qRCode.findUnique({
    where: { token: qrToken },
    select: { id: true, status: true, tableId: true, table: { select: { primaryTableId: true } } },
  })
  if (!qr) return { ok: false, reason: "QR_NOT_FOUND" }
  if (qr.status === "INVALIDATED") return { ok: false, reason: "QR_INVALIDATED" }

  const targetTableId = qr.table.primaryTableId ?? qr.tableId

  const session = await prisma.tableSession.findFirst({
    where: { tableId: targetTableId, status: { in: ["OPEN", "AWAITING_BILL"] } },
    orderBy: { openedAt: "desc" },
    select: { id: true, openedAt: true, status: true, table: { select: { id: true, code: true } } },
  })
  if (!session) return { ok: false, reason: "NO_SESSION" }

  return {
    ok: true,
    sessionId: session.id,
    tableId: session.table.id,
    tableCode: session.table.code,
    openedAt: session.openedAt,
    awaitingBill: session.status === "AWAITING_BILL",
  }
}

export type MenuOption = { id: string; name: string; priceDelta: number }
export type MenuModifierGroup = {
  id: string
  name: string
  selectionType: "SINGLE" | "MULTIPLE"
  required: boolean
  options: MenuOption[]
}
export type MenuItemCard = {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  isFeatured: boolean
  modifierGroups: MenuModifierGroup[]
}

function toMenuCard(item: {
  id: string
  name: string
  description: string | null
  price: unknown
  imageUrl: string | null
  isFeatured: boolean
  modifierGroups: {
    id: string
    name: string
    selectionType: "SINGLE" | "MULTIPLE"
    required: boolean
    options: { id: string; name: string; priceDelta: unknown }[]
  }[]
}): MenuItemCard {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: toNumber(item.price),
    imageUrl: item.imageUrl,
    isFeatured: item.isFeatured,
    modifierGroups: item.modifierGroups.map((group) => ({
      id: group.id,
      name: group.name,
      selectionType: group.selectionType,
      required: group.required,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: toNumber(option.priceDelta),
      })),
    })),
  }
}

const MENU_INCLUDE = {
  modifierGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: { options: { orderBy: { sortOrder: "asc" as const } } },
  },
}

export async function listMenu(): Promise<{ featured: MenuItemCard[]; all: MenuItemCard[] }> {
  const items = await prisma.menuItem.findMany({
    where: { isActive: true },
    orderBy: [{ isFeatured: "desc" }, { featuredSortOrder: "asc" }, { name: "asc" }],
    include: MENU_INCLUDE,
  })

  const cards = items.map(toMenuCard)
  return {
    featured: cards.filter((c) => c.isFeatured).slice(0, 6),
    all: cards,
  }
}

export async function getMenuItem(id: string): Promise<MenuItemCard | null> {
  const item = await prisma.menuItem.findFirst({
    where: { id, isActive: true },
    include: MENU_INCLUDE,
  })
  return item ? toMenuCard(item) : null
}

export type CustomerOrderView = {
  sessionId: string
  tableCode: string
  awaitingBill: boolean
  total: number
  orders: {
    id: string
    orderNumber: number
    submittedAt: Date
    items: OrderItemRow[]
  }[]
}

/// สถานะออร์เดอร์ที่ลูกค้าเห็น — หน้า /order/[qrToken]/status โพลตัวนี้เป็นรอบ ๆ
export async function getCustomerOrderView(sessionId: string): Promise<CustomerOrderView | null> {
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      table: { select: { code: true } },
      orders: {
        orderBy: { orderNumber: "asc" },
        include: {
          items: { orderBy: { createdAt: "asc" }, include: { menuItem: { select: { name: true } } } },
        },
      },
    },
  })
  if (!session) return null

  const orders = session.orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    submittedAt: order.submittedAt,
    items: order.items.map<OrderItemRow>((item) => ({
      id: item.id,
      menuItemName: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      subtotal: toNumber(item.unitPrice) * item.quantity,
      note: item.note,
      status: item.status,
      options: parseOptions(item.selectedOptionsSnapshot),
      cancelReason: item.cancelReason,
    })),
  }))

  const total = orders
    .flatMap((o) => o.items)
    .filter((i) => i.status !== "CANCELLED")
    .reduce((sum, i) => sum + i.subtotal, 0)

  return {
    sessionId: session.id,
    tableCode: session.table.code,
    awaitingBill: session.status === "AWAITING_BILL",
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    orders,
  }
}

export type QrCodeRow = {
  tableId: string
  tableCode: string
  tableStatus: TableCardStatus
  qrId: string | null
  token: string | null
  type: "STATIC" | "DYNAMIC" | null
  issuedAt: Date | null
  invalidatedCount: number
}

/// รายการ QR ต่อโต๊ะ — ใช้ได้พร้อมกันแค่ 1 ใบต่อโต๊ะ (ใบเก่าต้องถูก invalidate ก่อน)
export async function listQrCodes(): Promise<QrCodeRow[]> {
  const tables = await prisma.table.findMany({
    orderBy: { code: "asc" },
    include: {
      qrCodes: { orderBy: { issuedAt: "desc" } },
    },
  })

  return tables.map((table) => {
    const active = table.qrCodes.find((qr) => qr.status === "ACTIVE") ?? null
    return {
      tableId: table.id,
      tableCode: table.code,
      tableStatus: table.status,
      qrId: active?.id ?? null,
      token: active?.token ?? null,
      type: active?.type ?? null,
      issuedAt: active?.issuedAt ?? null,
      invalidatedCount: table.qrCodes.filter((qr) => qr.status === "INVALIDATED").length,
    }
  })
}
