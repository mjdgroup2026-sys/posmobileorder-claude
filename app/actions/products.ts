"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { productSchema, idSchema, firstIssueMessage, zodToFieldErrors } from "@/lib/validation"
import type { ActionResult } from "@/lib/types"

const AUTH_ERROR = "กรุณาเข้าสู่ระบบก่อนทำรายการ"

function revalidateProductPages() {
  revalidatePath("/products")
  revalidatePath("/")
  revalidatePath("/stock-in")
  revalidatePath("/stock-out")
}

/// สร้าง SKU ถัดไปแบบ SKU-1001, SKU-1002, … (หา max +1)
async function nextSku(): Promise<string> {
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("sku" FROM '^SKU-([0-9]+)$') AS INTEGER)) AS max
    FROM "product"
    WHERE "sku" ~ '^SKU-[0-9]+$'
  `
  const max = rows[0]?.max ?? 1000
  return `SKU-${max + 1}`
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser()
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    price: formData.get("price"),
    reorderPoint: formData.get("reorderPoint"),
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error),
      fieldErrors: zodToFieldErrors(parsed.error),
    }
  }

  const data = parsed.data

  // SKU auto-gen อาจชนกันได้ถ้าสร้างพร้อมกันหลาย session — retry จน insert ผ่าน
  for (let attempt = 0; attempt < 5; attempt++) {
    const sku = data.sku ?? (await nextSku())
    try {
      await prisma.product.create({
        data: {
          sku,
          name: data.name,
          category: data.category,
          unit: data.unit,
          price: data.price.toFixed(2),
          reorderPoint: data.reorderPoint,
        },
      })
      revalidateProductPages()
      return { ok: true, message: `เพิ่มสินค้า ${data.name} (${sku}) เรียบร้อยแล้ว` }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== "P2002") {
        return { ok: false, error: "บันทึกสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
      }
      // ผู้ใช้กรอก SKU เอง แล้วซ้ำ → ไม่ต้อง retry บอกไปเลย
      if (data.sku) {
        return {
          ok: false,
          error: `รหัสสินค้า ${data.sku} ถูกใช้ไปแล้ว`,
          fieldErrors: { sku: "SKU นี้ซ้ำกับสินค้าที่มีอยู่" },
        }
      }
    }
  }

  return { ok: false, error: "สร้างรหัสสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
}

export async function updateProduct(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser()
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  const identity = idSchema.safeParse({ id: formData.get("id") })
  if (!identity.success) return { ok: false, error: firstIssueMessage(identity.error) }

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    price: formData.get("price"),
    reorderPoint: formData.get("reorderPoint"),
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error),
      fieldErrors: zodToFieldErrors(parsed.error),
    }
  }

  const data = parsed.data

  try {
    await prisma.product.update({
      where: { id: identity.data.id },
      // ไม่มี quantity ในชุดนี้โดยตั้งใจ — ยอดสต็อกแก้ได้ผ่าน Stock In/Out เท่านั้น (กติกาข้อ 2)
      data: {
        ...(data.sku ? { sku: data.sku } : {}),
        name: data.name,
        category: data.category,
        unit: data.unit,
        price: data.price.toFixed(2),
        reorderPoint: data.reorderPoint,
      },
    })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === "P2002") {
      return {
        ok: false,
        error: `รหัสสินค้า ${data.sku} ถูกใช้ไปแล้ว`,
        fieldErrors: { sku: "SKU นี้ซ้ำกับสินค้าที่มีอยู่" },
      }
    }
    if (code === "P2025") return { ok: false, error: "ไม่พบสินค้าที่ต้องการแก้ไข" }
    return { ok: false, error: "แก้ไขสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }

  revalidateProductPages()
  return { ok: true, message: `แก้ไขสินค้า ${data.name} เรียบร้อยแล้ว` }
}

export async function deleteProduct(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser()
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  const identity = idSchema.safeParse({ id: formData.get("id") })
  if (!identity.success) return { ok: false, error: firstIssueMessage(identity.error) }

  try {
    await prisma.product.delete({ where: { id: identity.data.id } })
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return { ok: false, error: "ไม่พบสินค้าที่ต้องการลบ" }
    }
    return { ok: false, error: "ลบสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }

  revalidateProductPages()
  return { ok: true, message: "ลบสินค้าเรียบร้อยแล้ว" }
}
