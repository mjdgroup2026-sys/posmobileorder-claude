---
description: สร้าง CRUD ครบชุด (action + zod + query + หน้า list + ฟอร์ม dialog) ให้ Prisma model ที่ระบุ
argument-hint: <ชื่อ Prisma model เช่น Category>
---

สร้าง CRUD ครบชุดสำหรับ Prisma model **`$ARGUMENTS`**

ตลอดคำสั่งนี้ `<Model>` = ชื่อ model ตามที่ระบุ (PascalCase) · `<model>` = ชื่อเดียวกันแบบ kebab-case ตัวเล็ก
(เช่น `Category` → `category`, `MenuItem` → `menu-item`)

## ขั้นที่ 1 — อ่านก่อน ห้ามเขียนโค้ดทันที

- @prisma/schema.prisma — ดูฟิลด์ของ `<Model>` ให้ครบ: ชนิด, `?` (optional), `@default`, `@unique`,
  relation, และ **มีฟิลด์ `deletedAt` หรือไม่** (ตัวนี้ตัดสินว่าจะ soft-delete หรือ hard-delete)
- @CLAUDE.md — กติกาที่ห้ามละเมิด, pattern, design system, กับดัก

ถ้า **ไม่พบ model ชื่อนี้ใน schema** → หยุด แล้วบอกผู้ใช้ว่ายังไม่มี ต้องเพิ่ม schema + migration
(`/migration`) ก่อน **ห้ามเดาฟิลด์เอง**

ถ้า model นี้ **มีฟิลด์ `quantity` หรือเกี่ยวกับสต็อก/เงิน** → เตือนผู้ใช้ว่าการแก้ยอดต้องผ่าน
`StockTransaction` ใน `prisma.$transaction` เดียวกัน (กติกาข้อ 2–4) CRUD generic ตัวนี้ครอบไม่ได้
ต้องออกแบบเพิ่ม

สรุปสั้น ๆ ให้ผู้ใช้เห็นก่อนลงมือ: ฟิลด์ที่จะทำฟอร์ม, ฟิลด์ที่ generate เอง (id/createdAt/updatedAt),
`deletedAt` มีหรือไม่ → soft-delete หรือ hard-delete

## ขั้นที่ 2 — ไฟล์ที่ต้องสร้าง/แก้ (4 จุด)

### 1. `lib/validation.ts` — เพิ่ม zod schema

> ⚠️ ไฟล์จริงในโปรเจกต์นี้ชื่อ **`lib/validation.ts`** (เอกพจน์) ไม่ใช่ `validations.ts` — **เพิ่มลงไฟล์เดิม
> ห้ามสร้างไฟล์ใหม่** และห้ามประกาศ schema แบบ inline ในไฟล์ action

```ts
export const <model>Schema = z.object({
  // ทุก message เป็นภาษาไทย · ตัวเลขใช้ helper ที่มีอยู่แล้วในไฟล์ (positiveInt / nonNegativeInt / …)
})
```

ใช้ `idSchema` ที่มีอยู่แล้วสำหรับ update/delete ไม่ประกาศใหม่

### 2. `lib/queries.ts` — เพิ่ม read query

```ts
export type <Model>ListItem = { /* ฟิลด์ที่หน้า list ใช้จริงเท่านั้น */ }

export async function list<Model>s(params: { search?: string } = {}) {
  const rows = await prisma.<model>.findMany({
    where: {
      // ⬇️ ใส่บรรทัดนี้เฉพาะเมื่อ model มีฟิลด์ deletedAt จริงในสคีมา
      deletedAt: null,
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
  })
  // Decimal → toNumber() ก่อนคืนออกไปเสมอ
}
```

- ไฟล์นี้ `import "server-only"` อยู่แล้ว — **ฟังก์ชันอ่านข้อมูลทั้งหมดต้องอยู่ที่นี่** ห้ามยิง prisma
  ตรง ๆ จากหน้าเพจหรือ component
- ถ้า model มี `deletedAt` → **ทุก** query ต้องมี `deletedAt: null` ห้ามลืมแม้แต่ตัวเดียว
  (รวม query นับจำนวน/ตรวจซ้ำ)
- ถ้าใช้ `$queryRaw` ต้องใช้ **ชื่อตารางจริงตาม `@@map`** (snake_case) ไม่ใช่ชื่อ model

### 3. `app/actions/<model>.ts` — Server Actions

```ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { <model>Schema, idSchema, firstIssueMessage, zodToFieldErrors } from "@/lib/validation"
import type { ActionResult } from "@/lib/types"

const AUTH_ERROR = "กรุณาเข้าสู่ระบบก่อนทำรายการ"

function revalidate<Model>Pages() {
  revalidatePath("/<model>")
  // + ทุกหน้าที่แสดงข้อมูลนี้ (เช่น "/" ถ้า dashboard ใช้)
}

export async function create<Model>(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser()                      // ← กติกาข้อ 5: บรรทัดแรกเสมอ
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  const parsed = <model>Schema.safeParse({ /* ดึงจาก formData ทีละฟิลด์ */ })
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error),
      fieldErrors: zodToFieldErrors(parsed.error),
    }
  }

  await prisma.<model>.create({ data: parsed.data })
  revalidate<Model>Pages()
  return { ok: true, message: "บันทึกเรียบร้อยแล้ว" }
}
```

ครบ 3 ตัว: `create<Model>` / `update<Model>` / `delete<Model>` โดย **delete แยกตาม schema**:

| กรณี | วิธีลบ |
|---|---|
| model **มี** `deletedAt` | soft-delete: `prisma.<model>.update({ where: { id }, data: { deletedAt: new Date() } })` — **ห้าม `delete()`** |
| model **ไม่มี** `deletedAt` | hard-delete: `prisma.<model>.delete({ where: { id } })` + ตรวจ relation ที่ผูกอยู่ก่อน แล้วคืน error ภาษาไทยถ้าลบไม่ได้ |

ข้อบังคับของทุก action:
- คืน `ActionResult` จาก `@/lib/types` เสมอ · **ห้าม throw ให้ผู้ใช้เห็น** · ห้ามคืน error ดิบจาก Prisma
- `revalidatePath` **หลัง mutation ทุกครั้ง** ก่อน `return { ok: true }`
- ดัก unique constraint (P2002) แล้วคืนข้อความไทยที่บอกว่าฟิลด์ไหนซ้ำ
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด

### 4. หน้า list + ฟอร์ม dialog

**หน้า list: `app/(staff)/(app)/<model>/page.tsx`**

> ⚠️ โปรเจกต์นี้ใช้ route group — หน้าฝั่งพนักงานอยู่ใต้ `app/(staff)/(app)/` **ไม่ใช่ `app/` ตรง ๆ**
> `AppShell` (`.app-shell` + Sidebar + Topbar) ถูก render โดย `app/(staff)/(app)/layout.tsx` อยู่แล้ว
> หน้าเพจจึง **ไม่ต้อง**ใส่เอง แค่วางไฟล์ให้ถูกที่ · URL ที่ได้คือ `/<model>` (ชื่อ route group ไม่ติดใน path)

```tsx
import { list<Model>s } from "@/lib/queries"
import { <Model>Manager } from "@/components/<model>/<model>-manager"

export const dynamic = "force-dynamic"
export const metadata = { title: "…ภาษาไทย…" }

export default async function <Model>Page({ searchParams }: PageProps<"/<model>">) {
  const params = await searchParams              // Next.js 16: เป็น Promise ต้อง await
  const search = typeof params.q === "string" ? params.q : ""
  const items = await list<Model>s({ search })

  return <<Model>Manager items={items} search={search} />
}
```

เป็น **RSC** — ห้ามใส่ `"use client"` ในไฟล์เพจ · ดึงข้อมูลผ่าน `lib/queries.ts` เท่านั้น

**ฟอร์ม dialog: `components/<model>/<model>-manager.tsx`** (`"use client"`)

ทำตามแบบเดียวกับ `components/product-manager.tsx`:
- `Dialog` (สร้าง/แก้ไข) + `AlertDialog` (ยืนยันลบ) จาก `components/ui/`
- `const result = await create<Model>(formData)` → เช็ค `result.ok` →
  ถ้าไม่ผ่าน: `setFieldErrors(result.fieldErrors ?? {})` + `toast.error(result.error)` →
  ถ้าผ่าน: `toast.success(result.message)` + ปิด dialog + `router.refresh()`
- `fieldErrors` แสดงใต้ช่องกรอกด้วย `.field-hint.error`
- ปุ่มขณะกำลังส่งต้อง disable กันกดซ้ำ

**เพิ่มเมนูใน `components/sidebar.tsx`** ชี้ไป `/<model>` ถ้าฟีเจอร์นี้ควรมีเมนู

## กฎที่ห้ามละเมิด (ตรวจทุกไฟล์ก่อนบอกว่าเสร็จ)

- **ห้ามใส่ semicolon** ปิดท้ายบรรทัดในไฟล์ `.ts`/`.tsx` ทุกไฟล์ (กติกาข้อ 1)
- ไฟล์ action ขึ้นต้นด้วย `"use server"` · `revalidatePath` หลัง mutation ทุกครั้ง
- **ห้าม hardcode สี hex** — ใช้ class จาก `app/globals.css` (`.card-ui`, `.btn`, `.chip`, `.field`,
  `.t-h2`, `.num`, …) และ token เชิงความหมาย `var(--brand)` / `var(--ink)` / `var(--line)` /
  `var(--surface)` · **ห้ามอ้าง token ชื่อสีตรง ๆ** เช่น `var(--teal-600)` เพราะ class ชุดเดียวกัน
  ต้องใช้ได้ทั้งธีม `staff` และ `customer`
- ไอคอน import จาก `components/icons.tsx` เท่านั้น **ห้าม import จาก `lucide-react` ตรง ๆ**
- ห้ามแก้ไฟล์ใน `components/ui/` ด้วยมือ (ถ้าขาด component ให้ `pnpm dlx shadcn@latest add <ชื่อ>`)
- TypeScript strict — ห้าม `any` / `@ts-ignore`
- Decimal จาก Prisma ต้อง `toNumber()` (จาก `lib/format.ts`) ก่อนส่งเข้า Client Component ·
  ตอนเขียนลง DB ส่งเป็น string ด้วย `value.toFixed(2)`

## ขั้นที่ 3 — ปิดงาน

1. รัน `/check` (semicolon → typecheck → lint → build) แก้ให้ผ่านครบ
2. อัปเดต `Docs/spec.md` — ติ๊ก checkbox ข้อที่ทำเสร็จ
3. รายงานสรุปว่าแตะไฟล์ไหนบ้าง และ `<Model>` นี้เป็น soft-delete หรือ hard-delete
