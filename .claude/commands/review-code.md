---
description: รีวิวโค้ดตาม convention โปรเจกต์ — Correctness, Convention, Error Handling, Performance, Security
argument-hint: @path/to/file.ts [@path/to/another.tsx …]
---

รีวิวไฟล์: **$ARGUMENTS**

อ่านไฟล์ที่ระบุให้ครบก่อน (รวมไฟล์ที่มันเรียกใช้ เช่น `lib/queries.ts`, `lib/validation.ts`, schema ที่เกี่ยวข้อง)
แล้วตรวจครบทั้ง 5 หมวดนี้ **ห้ามข้ามหมวดไหน** ถึงแม้จะไม่เจอปัญหาก็ต้องรายงานว่าผ่าน

### 1. Correctness
- logic ตรงกับที่ตั้งใจไหม, edge case (ค่าว่าง, 0, ติดลบ, array ว่าง, ผู้ใช้กดซ้ำ) ครบไหม
- ทุกการเปลี่ยนยอดสต็อกเขียน `StockTransaction` + อัปเดต `product.quantity` ใน `prisma.$transaction`
  **เดียวกัน** ไหม (กติกาข้อ 2) · `StockTransaction` ถูกแก้/ลบย้อนหลังหรือเปล่า (กติกาข้อ 3 — append-only)
- **Race condition**: การตัดสต็อก/เปลี่ยนสถานะต้องเป็น conditional update
  (`updateMany` + `where: { quantity: { gte: n } }` หรือ `where: { status: '…' }`) **ไม่ใช่ read-then-write
  หรือ `if` ก่อนหน้า** (กติกาข้อ 4 และ 7) — เจอ read-then-write เมื่อไหร่คือ ❌ ทันที
- Next.js 16: `params` / `searchParams` / `cookies()` / `headers()` ถูก `await` ครบไหม
- Decimal จาก Prisma ถูกแปลงด้วย `toNumber()` ก่อนส่งเข้า Client Component ไหม

### 2. Convention
- **ห้ามมี semicolon ปิดท้ายบรรทัด** (กติกาข้อ 1) — ระบุเลขบรรทัดที่เจอให้ครบ
- Server Action คืน `ActionResult` เสมอ, ไม่ throw ให้ผู้ใช้เห็น, มี `revalidatePath` หลังเขียน DB
- **`deletedAt` filter** — ทุก query ที่อ่าน model ซึ่งมีฟิลด์ soft-delete ต้องมี `where: { deletedAt: null }`
  (เช็ค `prisma/schema.prisma` ก่อนว่า model นั้นมี `deletedAt` จริงไหม ถ้าไม่มีให้ข้ามข้อนี้และบอกว่าไม่เกี่ยว)
- TypeScript strict — ไม่มี `any` / `@ts-ignore` / non-null assertion แบบเดา
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด (รวม validation/error)
- zod schema อยู่ที่ `lib/validation.ts` ไม่ inline · query อยู่ที่ `lib/queries.ts` (`import 'server-only'`)
- UI: ใช้ class จาก `app/globals.css` ก่อน Tailwind utility · **ห้าม hex ดิบ** (ยกเว้นเทมเพลตอีเมล) ·
  ห้าม `var(--teal-600)` ตรง ๆ ให้ใช้ token เชิงความหมาย (`var(--brand)`) · ไอคอน import จาก
  `components/icons.tsx` ไม่ใช่ `lucide-react` ตรง ๆ
- raw SQL (`$queryRaw` / `$executeRaw`) ใช้ **ชื่อตารางจริงในฐาน (snake_case ตาม `@@map`)** ไม่ใช่ชื่อ model

### 3. Error Handling
- `try/catch` ครอบจุดที่พังได้จริง (DB, network, parse) และ **error ที่ผู้ใช้เห็นเป็นภาษาไทย**
- ไม่กลืน error เงียบ ๆ (`catch {}` เปล่า) และไม่โยน stack trace / ข้อความจาก Prisma ดิบ ๆ ให้ผู้ใช้
- validation ล้มเหลวต้องคืน `fieldErrors` ให้ฟอร์มแสดงใต้ช่องกรอกได้
- ฝั่ง client เช็ค `result.ok` ก่อน `toast.success/error` และ `router.refresh()` ครบไหม

### 4. Performance
- N+1 query (loop แล้วยิง Prisma ข้างใน) → ใช้ `include` / `select` / `groupBy` แทน
- `select` เฉพาะฟิลด์ที่ใช้จริง ไม่ดึงทั้งแถวโดยไม่จำเป็น
- มี pagination / `take` สำหรับ list ที่โตได้ไม่จำกัดไหม
- field ที่ใช้ filter/sort บ่อยมี `@@index` ใน schema ไหม
- Client Component ก้อนใหญ่เกินจำเป็นไหม (ดันงานไป Server Component ได้หรือเปล่า)

### 5. Security
- **ทุก Server Action ที่แตะข้อมูลเรียก `requireUser()` เป็นบรรทัดแรก** (กติกาข้อ 5) — ซ่อนปุ่มใน UI ไม่นับ
- input ทุกตัวผ่าน zod ก่อนใช้ ไม่เชื่อค่าจาก client (โดยเฉพาะราคา/ยอดเงิน/จำนวน — ต้องคำนวณฝั่ง server)
- ไม่มี SQL injection จากการต่อ string ใน raw SQL (ต้องใช้ tagged template หรือ parameter)
- ไม่ leak ข้อมูลผู้ใช้อื่น (query กรองด้วย id ของผู้ใช้ปัจจุบันแล้วหรือยัง)
- ไม่มี secret / token / connection string hardcode · ไม่ log ลิงก์ยืนยันอีเมลหรือรีเซ็ตรหัสผ่านบน production
- route ใหม่ที่ควรถูกกันต้องไม่หลุดเป็น public path ใน `proxy.ts`

## รูปแบบผลลัพธ์

รายงานแยกตาม 5 หมวดข้างบน แต่ละข้อขึ้นต้นด้วยสัญลักษณ์เดียวใน 3 แบบนี้ พร้อม `path:line` และวิธีแก้ที่ทำได้ทันที:

- ✅ **ดีแล้ว** — ถูกต้องตาม convention ไม่ต้องแตะ
- ⚠️ **ควรปรับ** — ใช้งานได้แต่ควรดีขึ้น (readability, performance เล็กน้อย, ชื่อไม่สื่อ)
- ❌ **ต้องแก้ด่วน** — ผิดกติกาที่ห้ามละเมิด, มีบั๊ก, race condition, ช่องโหว่ความปลอดภัย, ข้อมูลเสียหายได้

ตัวอย่าง:

```markdown
### 1. Correctness
❌ `app/actions/pos.ts:42` — ตรวจสต็อกด้วย `if (product.quantity >= qty)` แล้วค่อย `update`
   เป็น read-then-write กันขายเกินตอนยิงพร้อมกันไม่ได้ (กติกาข้อ 4)
   → เปลี่ยนเป็น `updateMany({ where: { id, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } })`
      แล้วเช็ค `count === 0` เพื่อคืน error ภาษาไทย
```

ปิดท้ายด้วยตารางสรุปจำนวน ✅ / ⚠️ / ❌ แยกตามหมวด และ **บอกชัด ๆ ว่าไฟล์นี้ผ่านหรือไม่ผ่าน**
(มี ❌ แม้ข้อเดียว = ไม่ผ่าน) · ถ้าผู้ใช้สั่งให้แก้ ค่อยลงมือแก้แล้วรัน `/check`
