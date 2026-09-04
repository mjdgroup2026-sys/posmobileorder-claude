import { z } from "zod"
import type { FieldErrors } from "@/lib/types"

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง"
}

export function zodToFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".")
    if (key && !result[key]) result[key] = issue.message
  }
  return result
}

/// เพดานของจำนวนนับ — กันค่าที่ทำให้ยอดสต็อกเพี้ยนถาวร (ledger เป็น append-only ลบคืนไม่ได้)
/// และกัน integer out of range ของคอลัมน์ Int (int4) ใน PostgreSQL
const MAX_COUNT = 1_000_000

const positiveInt = (label: string) =>
  z.coerce
    .number({ error: `${label} ต้องเป็นตัวเลข` })
    .int(`${label} ต้องเป็นจำนวนเต็ม`)
    .positive(`${label} ต้องมากกว่า 0`)
    .max(MAX_COUNT, `${label} ต้องไม่เกิน ${MAX_COUNT.toLocaleString("th-TH")}`)

const nonNegativeInt = (label: string) =>
  z.coerce
    .number({ error: `${label} ต้องเป็นตัวเลข` })
    .int(`${label} ต้องเป็นจำนวนเต็ม`)
    .min(0, `${label} ต้องไม่ติดลบ`)
    .max(MAX_COUNT, `${label} ต้องไม่เกิน ${MAX_COUNT.toLocaleString("th-TH")}`)

export const productSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อสินค้า").max(120, "ชื่อสินค้ายาวเกินไป"),
  sku: z
    .string()
    .trim()
    .max(40, "SKU ยาวเกินไป")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  categoryId: z.string({ error: "กรุณาเลือกหมวดหมู่สินค้า" }).trim().min(1, "กรุณาเลือกหมวดหมู่สินค้า"),
  unit: z.string().trim().min(1, "กรุณาระบุหน่วยนับ").max(20, "หน่วยนับยาวเกินไป"),
  price: z.coerce
    .number({ error: "ราคาต้องเป็นตัวเลข" })
    .min(0, "ราคาต้องไม่ติดลบ")
    .max(9_999_999, "ราคาสูงเกินไป"),
  reorderPoint: nonNegativeInt("จุดสั่งซื้อ"),
})

/// รับ null ได้ด้วย เพราะ formData.get() คืน null เมื่อไม่มีฟิลด์นั้น —
/// ถ้าไม่ดักไว้ zod จะคืนข้อความอังกฤษดิบ "expected string, received null" ให้ผู้ใช้ (ละเมิดกติกาข้อ 6)
export const stockMoveSchema = z.object({
  productId: z.string({ error: "กรุณาเลือกสินค้า" }).trim().min(1, "กรุณาเลือกสินค้า"),
  quantity: positiveInt("จำนวน"),
  note: z
    .string({ error: "หมายเหตุไม่ถูกต้อง" })
    .trim()
    .max(200, "หมายเหตุยาวเกินไป")
    .nullish()
    .transform((v) => (v === "" || v === null ? undefined : v)),
})

export const idSchema = z.object({
  id: z.string().trim().min(1, "ไม่พบรายการที่ต้องการ"),
})

export const profileSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อ").max(80, "ชื่อยาวเกินไป"),
})

export type ProductInput = z.infer<typeof productSchema>
export type StockMoveInput = z.infer<typeof stockMoveSchema>

// ───────────────────────────── POS (Phase 2.5) ─────────────────────────────

/// เพดานจำนวนเงินต่อบิล — กัน Decimal(12,2) ล้นและกันค่าที่พิมพ์พลาดจนยอดขายเพี้ยนถาวร
const MAX_MONEY = 9_999_999

const money = (label: string) =>
  z.coerce
    .number({ error: `${label} ต้องเป็นตัวเลข` })
    .min(0, `${label} ต้องไม่ติดลบ`)
    .max(MAX_MONEY, `${label} สูงเกินไป`)

export const categorySchema = z.object({
  name: z.string({ error: "กรุณากรอกชื่อหมวดหมู่" }).trim().min(1, "กรุณากรอกชื่อหมวดหมู่").max(60, "ชื่อหมวดหมู่ยาวเกินไป"),
})

export const cartItemSchema = z.object({
  productId: z.string({ error: "กรุณาเลือกสินค้า" }).trim().min(1, "กรุณาเลือกสินค้า"),
  quantity: positiveInt("จำนวน"),
})

/// ตะกร้าถูกส่งมาเป็น JSON string ในฟิลด์ `items` ของ FormData
export const saleSchema = z.object({
  items: z
    .array(cartItemSchema, { error: "ตะกร้าไม่ถูกต้อง" })
    .min(1, "กรุณาเพิ่มสินค้าลงตะกร้าก่อนชำระเงิน")
    .max(200, "รายการในตะกร้ามากเกินไป"),
  discount: money("ส่วนลด"),
  paymentMethod: z.enum(["CASH", "TRANSFER", "QR"], { error: "กรุณาเลือกวิธีชำระเงิน" }),
  amountReceived: money("จำนวนเงินที่รับ"),
  note: z
    .string({ error: "หมายเหตุไม่ถูกต้อง" })
    .trim()
    .max(200, "หมายเหตุยาวเกินไป")
    .nullish()
    .transform((v) => (v === "" || v === null ? undefined : v)),
})

export const voidSaleSchema = z.object({
  id: z.string({ error: "ไม่พบบิลที่ต้องการยกเลิก" }).trim().min(1, "ไม่พบบิลที่ต้องการยกเลิก"),
  reason: z
    .string({ error: "เหตุผลไม่ถูกต้อง" })
    .trim()
    .min(1, "กรุณาระบุเหตุผลที่ยกเลิกบิล")
    .max(200, "เหตุผลยาวเกินไป"),
})

export const closingSchema = z.object({
  countedCash: money("เงินสดที่นับได้"),
  note: z
    .string({ error: "หมายเหตุไม่ถูกต้อง" })
    .trim()
    .max(200, "หมายเหตุยาวเกินไป")
    .nullish()
    .transform((v) => (v === "" || v === null ? undefined : v)),
})

/// แปลง JSON string ของตะกร้าเป็น array ก่อนส่งเข้า zod — พังเมื่อไหร่คืน [] ให้ zod ฟ้องเป็นภาษาไทยแทน
export function parseCartJson(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || raw.trim() === "") return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export type CategoryInput = z.infer<typeof categorySchema>
export type SaleInput = z.infer<typeof saleSchema>
export type ClosingInput = z.infer<typeof closingSchema>

// ───────────────────── MJD Mobile Order (Phase 6) ─────────────────────

const requiredId = (label: string) =>
  z.string({ error: label }).trim().min(1, label)

/// เปิดโต๊ะได้ 2 ทาง: ลูกค้าสแกน QR (qrToken) หรือพนักงานกดเปิดเอง (tableId) — ต้องมีอย่างน้อยหนึ่งอย่าง
export const openTableSchema = z
  .object({
    tableId: z.string().trim().optional().transform((v) => (v === "" ? undefined : v)),
    qrToken: z.string().trim().optional().transform((v) => (v === "" ? undefined : v)),
  })
  .refine((v) => Boolean(v.tableId ?? v.qrToken), { message: "ไม่พบโต๊ะที่ต้องการเปิด" })

export const mergeTablesSchema = z
  .object({
    primaryTableId: requiredId("กรุณาเลือกโต๊ะหลัก"),
    secondaryTableId: requiredId("กรุณาเลือกโต๊ะที่จะรวม"),
  })
  .refine((v) => v.primaryTableId !== v.secondaryTableId, {
    message: "รวมโต๊ะกับตัวเองไม่ได้",
    path: ["secondaryTableId"],
  })

export const unmergeTableSchema = z.object({
  secondaryTableId: requiredId("กรุณาเลือกโต๊ะที่จะยกเลิกการรวม"),
})

export const cancelSessionSchema = z.object({
  sessionId: requiredId("ไม่พบโต๊ะที่ต้องการยกเลิก"),
  reason: z
    .string({ error: "เหตุผลไม่ถูกต้อง" })
    .trim()
    .min(1, "กรุณาระบุเหตุผลที่ยกเลิกโต๊ะ")
    .max(200, "เหตุผลยาวเกินไป"),
})

export const cancelOrderItemSchema = z.object({
  id: requiredId("ไม่พบรายการอาหารที่ต้องการยกเลิก"),
  reason: z
    .string({ error: "เหตุผลไม่ถูกต้อง" })
    .trim()
    .min(1, "กรุณาระบุเหตุผลที่ยกเลิกรายการ")
    .max(200, "เหตุผลยาวเกินไป"),
})

// ───────────────────── ฝั่งลูกค้า (Phase 9) ─────────────────────

export const cartLineSchema = z.object({
  menuItemId: requiredId("กรุณาเลือกเมนู"),
  quantity: positiveInt("จำนวน"),
  optionIds: z.array(z.string().trim().min(1)).max(20, "เลือกตัวเลือกมากเกินไป").default([]),
  note: z
    .string({ error: "โน้ตไม่ถูกต้อง" })
    .trim()
    .max(200, "โน้ตยาวเกินไป")
    .nullish()
    .transform((v) => (v === "" || v === null ? undefined : v)),
})

export const submitOrderSchema = z.object({
  qrToken: requiredId("ไม่พบ QR Code ของโต๊ะนี้"),
  items: z
    .array(cartLineSchema, { error: "ตะกร้าไม่ถูกต้อง" })
    .min(1, "กรุณาเลือกเมนูก่อนยืนยันออร์เดอร์")
    .max(100, "รายการในตะกร้ามากเกินไป"),
})

export const callStaffSchema = z.object({
  qrToken: requiredId("ไม่พบ QR Code ของโต๊ะนี้"),
  reason: z
    .string({ error: "ข้อความไม่ถูกต้อง" })
    .trim()
    .max(200, "ข้อความยาวเกินไป")
    .nullish()
    .transform((v) => (v === "" || v === null ? undefined : v)),
})

export const qrTokenSchema = z.object({
  qrToken: requiredId("ไม่พบ QR Code ของโต๊ะนี้"),
})

export const generateQrSchema = z.object({
  tableId: requiredId("กรุณาเลือกโต๊ะ"),
  type: z.enum(["STATIC", "DYNAMIC"], { error: "ประเภท QR ไม่ถูกต้อง" }),
})

export type CartLineInput = z.infer<typeof cartLineSchema>

// ───────────────────── ชำระเงิน (Phase 10) ─────────────────────

export const confirmPaymentSchema = z.object({
  sessionId: requiredId("ไม่พบโต๊ะที่ต้องการปิดบิล"),
  paymentMethod: z.enum(["PROMPTPAY", "CARD", "CASH", "TRANSFER"], {
    error: "กรุณาเลือกวิธีชำระเงิน",
  }),
  amountReceived: z.coerce
    .number({ error: "จำนวนเงินที่รับต้องเป็นตัวเลข" })
    .min(0, "จำนวนเงินที่รับต้องไม่ติดลบ")
    .max(9_999_999, "จำนวนเงินสูงเกินไป")
    .optional(),
  reference: z
    .string({ error: "เลขอ้างอิงไม่ถูกต้อง" })
    .trim()
    .max(120, "เลขอ้างอิงยาวเกินไป")
    .nullish()
    .transform((v) => (v === "" || v === null ? undefined : v)),
})

/// payload ที่ webhook ของผู้ให้บริการต้องส่งมา — ตั้งใจให้เล็กและเป็นกลาง ไม่ผูกกับเจ้าใดเจ้าหนึ่ง
export const paymentWebhookSchema = z.object({
  reference: z.string({ error: "ต้องมี reference" }).trim().min(1, "ต้องมี reference").max(120),
  sessionId: z.string().trim().min(1).optional(),
  qrToken: z.string().trim().min(1).optional(),
  amount: z.coerce.number({ error: "amount ต้องเป็นตัวเลข" }).min(0).max(9_999_999).optional(),
})

export const startPaymentSchema = z.object({
  qrToken: requiredId("ไม่พบ QR Code ของโต๊ะนี้"),
  method: z.enum(["PROMPTPAY", "CARD"], { error: "กรุณาเลือกวิธีชำระเงิน" }),
})
