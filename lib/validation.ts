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
  category: z.string().trim().min(1, "กรุณาระบุหมวดหมู่สินค้า").max(60, "ชื่อหมวดหมู่ยาวเกินไป"),
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
