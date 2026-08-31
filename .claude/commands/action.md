---
description: สร้าง Server Action ใหม่ตาม pattern ของโปรเจกต์
argument-hint: <ชื่อ action> <คำอธิบายสั้น ๆ>
---

สร้าง Server Action ชื่อ `$1` ($2) ใน `app/actions/` โดย**ต้อง**ทำตาม pattern นี้ทุกข้อ:

```ts
"use server"

export async function ชื่อ(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser()                       // ← กติกาข้อ 5: บรรทัดแรกเสมอ
  } catch {
    return { ok: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
  }

  const parsed = schema.safeParse({ /* … */ })
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error),
      fieldErrors: zodToFieldErrors(parsed.error),
    }
  }

  // … เขียน DB …
  revalidatePath("/…")
  return { ok: true, message: "บันทึกเรียบร้อยแล้ว" }
}
```

ข้อบังคับ:
- **ห้าม throw ให้ผู้ใช้เห็น** — คืน `ActionResult` เสมอ
- **ห้ามใส่ semicolon** (กติกาข้อ 1)
- **ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด** รวม validation และ error
- ถ้าแตะยอดสต็อก: ต้องเขียน `StockTransaction` + อัปเดต `Product.quantity` ใน `prisma.$transaction` เดียวกัน
  และถ้าเป็นการตัดออก **ต้องใช้ `updateMany` + `where: { quantity: { gte: n } }`** ไม่ใช่ `if` ก่อนหน้า (กติกาข้อ 4)
- เพิ่ม zod schema ที่ `lib/validation.ts` ไม่ประกาศ inline

หลังเขียนเสร็จรัน `/check`
