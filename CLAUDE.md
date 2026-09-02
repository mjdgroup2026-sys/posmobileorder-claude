@AGENTS.md

# MJD Mobile Order — สมองของโปรเจกต์

ระบบคลังสินค้าเบิกจ่าย + ขายหน้าร้าน (Inventory + POS) ที่มี **2 ช่องทางขาย (channel) คู่ขนานกัน**:
POS หน้าร้าน (retail, `Sale.channel = RETAIL_POS`) กับ **MJD Mobile Order** (สั่งอาหารผ่าน QR Code สำหรับ
ร้านอาหารแบบ table service, `Sale.channel = MOBILE_ORDER`) ทั้งสองช่องทางปิดบิลเข้า `Sale`/`SaleItem` ชุดเดียวกัน
ไม่ใช่ระบบแยก — ดูหัวข้อ [MJD Mobile Order](#-mjd-mobile-order-phase-612--ยังไม่เริ่ม) ท้ายไฟล์นี้

> ✅ **Phase 1–2 เสร็จแล้ว** — โครงโปรเจกต์ ฐานข้อมูล Auth และฟีเจอร์คลังสินค้าใช้งานได้จริง
> ส่วน Phase 2.5 ขึ้นไป (POS, MJD Mobile Order) ยังไม่ได้ทำ (ดู [สถานะการพัฒนา](#สถานะการพัฒนา))
>
> **dev server รันที่ port 3001** (`pnpm dev`) เพราะ container `pos-app` ของโปรเจกต์ POS_Shop เดิม
> ยึด 3000 อยู่ · `BETTER_AUTH_URL` ใน `.env` ต้องตรงกับ origin ที่ใช้จริงเสมอ ไม่งั้น Better Auth
> จะตอบ `INVALID_ORIGIN` ตอน sign-up/sign-in

**สัญญาอ้างอิงหลักคือ `Docs/spec.md`** — ทุกฟีเจอร์ ทุกกติกาธุรกิจ และ checklist ของแต่ละ Phase อยู่ในไฟล์นั้น
ทำงานเสร็จข้อไหนให้ติ๊ก checkbox ใน spec ด้วย

## ⏸️ งานที่ถูกกั้นไว้ — ห้ามเริ่มเอง

- **Role-Based Permission** — นอกขอบเขต v1 ดูหัวข้อ "สถานะการพัฒนา" ท้ายไฟล์นี้

## 📧 ระบบอีเมล (ข้อกำหนด — ทำใน Phase 5)

ฟังก์ชันส่งอีเมลต้องอยู่ที่ **`lib/mail.ts`** ที่เดียว (`sendVerificationMail` / `sendResetPasswordMail`)
ส่งผ่าน Resend HTTP API ด้วย `fetch` — ไม่เพิ่ม dependency · `lib/auth.ts` เป็นแค่ผู้เรียก

| env | ค่า |
|---|---|
| `RESEND_API_KEY` | key จาก resend.com — **เว้นว่าง = dev พิมพ์ลิงก์ลง console, production throw** |
| `MAIL_FROM` | ต้องอยู่ใต้โดเมนที่ verify ไว้: `MJD Mobile Order <no-reply@mail.jayjayservices.com>` |
| `MAIL_REPLY_TO` | ไม่บังคับ |

- **ห้ามพิมพ์ลิงก์ยืนยัน/รีเซ็ตรหัสผ่านลง log บน production** — ลิงก์คือ credential ชั่วคราว
- อีเมลใช้ **inline style + สี hex ดิบ** โดยตั้งใจ (mail client ไม่รองรับ `var()`) เป็นข้อยกเว้นเดียวของกติกาสี
- สมัครสมาชิกแล้ว **ต้องยืนยันอีเมลก่อนถึงล็อกอินได้** (`requireEmailVerification: true`) —
  ล็อกอินก่อนยืนยันจะได้ 403 code `EMAIL_NOT_VERIFIED` ซึ่งหน้า `/login` ต้องดักไว้
- ปลายทางหลังกดลิงก์ในอีเมลคือหน้า `/verify-email` (public path ใน `proxy.ts`)

## กติกาที่ห้ามละเมิด

1. **ห้ามใส่ semicolon** ในไฟล์ TypeScript/JavaScript ทุกไฟล์ (ยกเว้นโค้ดที่ generate เอง เช่น `generated/prisma/**`,
   `next-env.d.ts`) — ตรวจด้วย `/check`
2. **ทุกการเปลี่ยนยอดสต็อกต้องผ่าน `StockTransaction`** และเขียนใน `prisma.$transaction` เดียวกันกับการอัปเดต
   `product.quantity` เสมอ ห้ามแก้ `quantity` ตรง ๆ จากที่อื่น (รวมถึงฟอร์มแก้ไขสินค้า)
3. **`StockTransaction` เป็น ledger แบบ append-only** — ไม่ลบ ไม่แก้ย้อนหลัง ถ้าต้องกลับรายการให้สร้างรายการชดเชยใหม่
4. **กันเบิก/ขายเกินสต็อกด้วย `updateMany` + `where: { quantity: { gte: n } }`** ไม่ใช่แค่ `if` ก่อนหน้า —
   เป็นด่านเดียวที่กัน race condition ได้จริงตอนมีคำขอพร้อมกัน · ต้องมีเทส concurrent พิสูจน์ (เช่น ยิงพร้อมกัน
   10 คำขอจากสต็อก 8 → ต้องผ่านแค่ 4 และยอดต้องไม่ติดลบ)
5. **ทุก Server Action ที่แตะข้อมูลต้องเรียก `requireUser()` เป็นบรรทัดแรก** — ห้ามพึ่ง UI ที่ซ่อนปุ่มอย่างเดียว
   เพราะ Server Action ถูกเรียกตรงได้
6. **ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด** รวมถึงข้อความ validation และ error
7. **(Phase 6+, MJD Mobile Order) เปลี่ยน `MobileOrderItem.status` ต้องเป็น conditional update**
   (`updateMany` + `where: { status: 'AWAITING_KITCHEN' }`) เหมือนกติกากันขายเกินสต็อกในข้อ 4 — ป้องกัน race
   ระหว่างพนักงานกดยกเลิกรายการกับครัวกด "เริ่มทำ" พร้อมกัน ห้ามใช้ read-then-write ธรรมดา
8. **(Phase 6+) บิลจาก MJD Mobile Order ต้องออกเป็น `Sale` ปกติเสมอ** (`channel = MOBILE_ORDER` +
   `tableSessionId`) ห้ามสร้างตารางบิลแยก เพื่อให้ Dashboard/Reports/`/pos/history`/`CashierClosing` ใช้ query
   เดิมได้ครบโดยไม่ต้องเขียน logic ซ้ำ

## คำสั่งที่ใช้บ่อย

script เหล่านี้ต้องตั้งใน `package.json` ตั้งแต่ Phase 1 (ยังไม่มีจนกว่าจะสร้างโปรเจกต์)

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm lint` | ESLint (flat config; Next.js 16 ไม่มี `next lint` แล้ว) |
| `npx tsc --noEmit` | typecheck (ถ้าฟ้อง `LayoutProps`/`PageProps` ไม่รู้จัก ให้รัน `npx next typegen` ก่อน) |
| `pnpm db:seed` | seed ข้อมูลตัวอย่าง SKU-1001…SKU-1007 |
| `pnpm db:generate` | generate Prisma Client (ต้อง **รีสตาร์ต dev server** หลังรันเสมอ) |

## การทดสอบ

`pnpm test` รัน Vitest 4 — integration test ยิงลง PostgreSQL จริง (ฐาน **`posmobileorderdb_test`**
แยกจาก dev) · `pnpm test:watch` โหมด watch · `pnpm test:unit` / `pnpm test:integration` รันแยกกลุ่ม

Server Action ทดสอบได้โดย mock `next/cache` + `@/lib/session` แล้ว `await import()` action ตัวจริง
(`'use server'` เป็นแค่ string literal เมื่อรันใน vitest) — แม่แบบของไฟล์อื่นคือ
**`__tests__/integration/stock-out.test.ts`**

โครงไฟล์เทส (โฟลเดอร์ **`__tests__/`** ไม่ใช่ `tests/`):

```
__tests__/
├── setup.ts · stubs/server-only.ts · helpers/{db,form}.ts
├── unit/         — mock Prisma ด้วย vitest-mock-extended ไม่แตะ DB
├── integration/  — ยิง posmobileorderdb_test จริง
└── components/   — @testing-library/react (ใส่ docblock `// @vitest-environment jsdom` บรรทัดแรก)
```

- ต้อง alias `server-only` เป็นโมดูลว่างใน `vitest.config.mts` — Action ที่ดึง `lib/queries.ts` จะได้
  import ได้เลย **ไม่ต้อง `vi.mock('server-only')` รายไฟล์**
- **Vitest 4 ตัด `environmentMatchGlobs` ออกแล้ว** — ตั้ง `environment: "node"` เป็นค่าเริ่มต้น
  แล้วใช้ docblock `// @vitest-environment jsdom` ในไฟล์เทส component แทน
- `fileParallelism: false` เพราะ integration test ใช้ฐานเดียวกันแล้ว `TRUNCATE` ชนกัน
- `Sale.cashierId` เป็น FK ไปตาราง `user` — เทสต้อง `upsert` ผู้ใช้ทดสอบก่อนขาย
- ฐานทดสอบยังไม่มีหรือยังไม่ migrate → `pnpm db:test:migrate` (อ่าน `DATABASE_URL` จาก `.env.test`)
  ต้องสร้างฐานก่อนด้วย:
  ```bash
  docker exec posmobileorder-postgres psql -U posmobileorderuser -d postgres \
    -c "CREATE DATABASE posmobileorderdb_test;"
  ```
- `__tests__/helpers/db.ts` มี `assertTestDatabase()` ที่ throw ถ้าชื่อฐานไม่ลงท้าย `_test` —
  กันเทส `TRUNCATE` ฐาน dev ทิ้ง **ห้ามถอดออก**
- กติกาที่แตะ **สต็อกและเงิน** ต้องมีเทสครอบทุกข้อ (โดยเฉพาะ concurrent ตามกติกาข้อ 4 และข้อ 7)

## โครงสร้างโปรเจกต์ (เป้าหมายที่ต้องสร้าง)

components/icons.tsx — re-export ไอคอนจาก lucide-react ทั้งชุด เพิ่ม/เปลี่ยนที่นี่ที่เดียว
                       (หน้าอื่นห้าม import จาก lucide-react ตรง ๆ)
components/ui/ — shadcn/ui อย่าแก้มือ ใช้ `pnpm dlx shadcn@latest add <ชื่อ>`
app/globals.css — design system ทั้งหมด (tokens + component classes)
lib/queries.ts — ฟังก์ชันอ่านข้อมูลทั้งหมด (`import 'server-only'`)
proxy.ts — guard ชั้นแรก (Next.js 16 เปลี่ยนชื่อจาก middleware → proxy)
mobile-order.html — ต้นฉบับดีไซน์ 24 อาร์ตบอร์ด (ลูกค้า / พนักงาน-POS / ครัว / ผังระบบ) **มีอยู่จริงแล้ว**
Docs/spec.md — สัญญาอ้างอิงหลัก **มีอยู่จริงแล้ว**

## Design system

**ใช้ class ที่มีอยู่ก่อนเขียน Tailwind utility เอง** — รวม design token ทั้งหมดไว้ที่ `app/globals.css` ที่เดียว

ชุด class ด้านล่างเป็นมาตรฐานที่ยกมาจาก StockApp เดิม ให้สร้างขึ้นใน `app/globals.css` ตั้งแต่ Phase 1
(ถ้ามีไฟล์ `Design/tokens.css` ต้นฉบับ ให้พอร์ตมาแบบ 1:1):

- โครงหน้า: `.app-shell` `.sidebar` `.topbar` `.content` `.page-head` `.breadcrumb` `.row`
- กล่อง: `.card-ui` (ชื่อนี้ ไม่ใช่ `.card` เพราะเลี่ยงชนกับ shadcn) `.card-pad` `.stat-tile` `.panel-head` `.datatable-wrap`
- ฟอร์ม: `.field` `.field-grid` `.input` `.select` `.field-hint.error` `.checkbox-row`
- ปุ่ม: `.btn` + `.btn-primary|ghost|subtle|gold|danger|danger-solid` + `.btn-sm|lg|icon|block`
- สถานะ: `.chip.chip-success|warning|danger|neutral|info|teal` (ต้องมี `<span className="dot" />` ข้างใน)
- ตัวอักษร: `.t-h1` `.t-h2` `.t-h3` `.t-body` `.t-small` `.t-caption` `.t-eyebrow` · ตัวเลขใส่ `.num` ให้เรียงหลักตรงกัน
- แจ้งเตือน: `.alert-banner.danger|info|warning`

> ตอนพอร์ตเข้ามา ให้เปลี่ยน variant ที่ตั้งชื่อตามสี (`.chip-teal`, `.btn-gold`) เป็นชื่อเชิงความหมาย
> (`.chip-brand`, `.btn-accent`) และให้ map ไป `var(--brand)` — มิฉะนั้นพอใช้ในธีม `customer` จะได้สี teal
> โผล่กลางหน้าสีส้ม (ดูกติกาข้อ 2 ใต้หัวข้อธีม)

### ธีม: แยก token 2 ชุดตาม route group

โปรเจกต์นี้มี **2 พื้นผิว (surface) ที่ธีมคนละชุดกัน** — ตัดสินใจแล้วว่า**แยก token 2 ชุด** ไม่ยุบเป็นธีมเดียว:

| | ฝั่งพนักงาน/หลังบ้าน | ฝั่งลูกค้า |
|---|---|---|
| Route group | `app/(staff)/…` → `/pos/*`, `/products`, `/mobile-order/*`, KDS | `app/(customer)/…` → `/order/[qrToken]/*` |
| `data-theme` | `staff` | `customer` |
| สีแบรนด์ | teal `#01787B` | ส้ม `#E8571F` บนพื้นครีม `#FBF8F5` |
| ฟอนต์ | Inter + Anuphan (ไทย) + JetBrains Mono | Prompt (หัวเรื่อง) + Sarabun (เนื้อความ) |
| ต้นฉบับดีไซน์ | `Design/` เดิมของ StockApp | `mobile-order.html` (13 อาร์ตบอร์ดฝั่งลูกค้า) |
| ร้านเปลี่ยนสีเองได้ | ❌ | ✅ ผ่าน `StoreSettings.themeColor` (F21) |

**กติกาที่ต้องทำตาม:**

1. **`(staff)` และ `(customer)` เป็น root layout แยกกัน** (ไม่มี `app/layout.tsx` กลาง) — แต่ละกลุ่ม render
   `<html lang="th">`/`<body data-theme="…">` ของตัวเอง และโหลด**เฉพาะฟอนต์ของธีมตัวเอง** ไม่ให้หน้าลูกค้า
   ต้องดาวน์โหลดฟอนต์ฝั่งพนักงานทิ้งเปล่า ๆ (หน้าลูกค้าเปิดบนเน็ตมือถือ ทุก KB มีผล)
2. **ชื่อ token ต้องเป็น semantic ไม่ใช่ชื่อสี** — ใช้ `var(--brand)`, `var(--brand-ink)`, `var(--surface)`,
   `var(--ink)`, `var(--line)` · **ห้ามอ้าง `var(--teal-600)` ตรง ๆ ใน component class** เพราะ class ชุดเดียวกัน
   (`.btn`, `.card-ui`, `.chip`, …) ต้องใช้ได้ทั้งสองธีมโดยไม่แก้โค้ด
3. **`app/globals.css` เก็บทั้งสองชุดในไฟล์เดียว** — token เชิงโครงสร้าง (spacing, radius, shadow, สเกลฟอนต์)
   อยู่ใน `:root` ใช้ร่วมกัน · **เฉพาะสีกับ font-family เท่านั้นที่แยก** ใต้ `[data-theme="staff"]` และ
   `[data-theme="customer"]`
4. **สีของร้าน override ตอน runtime**: `(customer)/layout.tsx` อ่าน `StoreSettings.themeColor` แล้วเซ็ต
   `style={{ '--brand': themeColor }}` บน `<body>` — inline style ชนะ selector `[data-theme]` เสมอ
   จึงไม่ต้อง generate CSS ใหม่ต่อร้าน
5. ห้ามใส่ hex ดิบในโค้ด (ข้อยกเว้นเดียวคือเทมเพลตอีเมล ดู
   [§ระบบอีเมล](#-ระบบอีเมล-ข้อกำหนด--ทำใน-phase-5))

> ⚠️ **กับดัก**: root layout แยกกันแปลว่า**ไม่มี state/provider ที่แชร์ข้ามสองกลุ่มได้** และการนำทางข้ามกลุ่ม
> จะเป็น full page load ไม่ใช่ client-side navigation — ยอมรับได้เพราะลูกค้ากับพนักงานไม่เคยสลับหน้ากันอยู่แล้ว
> แต่ **component ที่ใช้ร่วมกันต้องไม่ผูกกับ provider ของกลุ่มใดกลุ่มหนึ่ง**

## Pattern ที่ใช้ทั้งโปรเจกต์

**Server Action** — คืน `ActionResult` เสมอ ไม่ throw ให้ผู้ใช้เห็น:

```ts
export async function doThing(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser()
  } catch {
    return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนทำรายการ' }
  }

  const parsed = schema.safeParse({ /* … */ })
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error), fieldErrors: zodToFieldErrors(parsed.error) }
  }

  // … เขียน DB …
  revalidatePath('/…')
  return { ok: true, message: 'บันทึกเรียบร้อยแล้ว' }
}
```

**ฝั่ง client** — `const result = await action(formData)` → เช็ค `result.ok` → `toast.success/error(...)` →
`router.refresh()` และเก็บ `result.fieldErrors` ลง state เพื่อแสดงใต้ช่องกรอก

**Decimal** — Prisma คืนค่าเป็น object แปลงด้วย `toNumber()` จาก `lib/format.ts` ก่อนส่งเข้า Client Component เสมอ
ตอนเขียนลง DB ส่งเป็น string ผ่าน `value.toFixed(2)`

## กับดักที่ต้องระวัง

ข้อที่มี 🔥 คือ **เจอจริงในโปรเจกต์นี้แล้ว** ที่เหลือยกมาจากโปรเจกต์ StockApp เดิม — จะเจอแน่ถ้าไม่ระวัง

- **หลัง `prisma generate` ต้องรีสตาร์ต dev server** ไม่งั้น Turbopack ใช้ module graph เก่า แล้วการเขียน DB
  "สำเร็จ" (HTTP 200) โดยไม่มีแถวถูกบันทึกจริง
- **Better Auth 1.7 มีฟิลด์ `account.issuer`** (`String`, required, unique ร่วมกับ `accountId`) ที่ `@better-auth/cli generate`
  รุ่นเก่ายัง generate ไม่ครบ — ถ้าเพิ่ม plugin แล้ว schema เพี้ยน ให้เทียบกับ
  `node_modules/.pnpm/@better-auth+core@*/node_modules/@better-auth/core/dist/db/get-tables.mjs` เป็นแหล่งจริง
- **`prisma migrate dev` ล้มเมื่อ non-interactive** ถ้ามี warning (เช่น เพิ่ม unique constraint) — ใช้ทางเลี่ยงใน `/migration`
- 🔥 **เพิ่ม/แก้ `@@map` = Prisma สั่ง DROP ตารางทิ้ง ข้อมูลหายหมด** — Prisma **ไม่รู้จักการ rename**
  มันเห็นเป็น "ตารางเก่าหาย + ตารางใหม่โผล่" เลยสร้าง migration เป็น `DROP TABLE` + `CREATE TABLE`
  (ตอนเพิ่ม `@@map("product")` มันเตือนว่า *"about to drop the `Product` table, which is not empty (7 rows)"*)
  → **ห้ามปล่อยให้ Prisma generate migration เอง** ให้เขียน `migration.sql` เองเป็น `ALTER TABLE ... RENAME TO ...`
  แล้วอย่าลืม rename **index / primary key / foreign key / not-null constraint** ให้ครบด้วย มิฉะนั้นชื่อจะไม่ตรง
  กับที่ Prisma คาดหวังแล้วเกิด drift · ขั้นตอนที่ใช้ได้จริง:
  1. `mkdir prisma/migrations/<timestamp>_<name>/` แล้วเขียน `migration.sql` เอง
  2. รันด้วย `docker exec -i <container> psql -U <user> -d <db> -v ON_ERROR_STOP=1 --single-transaction < migration.sql`
  3. `prisma migrate resolve --applied <timestamp>_<name>`
  4. **ยืนยันเสมอ** ด้วย `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
     ต้องได้ `No difference detected.`
  > ⚠️ **`prisma db execute --file ... --schema ...` เงียบ ๆ ไม่ทำงาน** — มันพ่นหน้า help ออกมาแทนแล้ว exit 0
  > ถ้าเผลอสั่ง `migrate resolve --applied` ต่อ จะได้สถานะพังคือ migration ถูกบันทึกว่า applied ทั้งที่ SQL
  > ยังไม่ได้รันเลย **ต้องเช็ค `\dt` ในฐานจริงทุกครั้งก่อน resolve**
- 🔥 **`$queryRaw` ไม่ผ่าน `@@map`** — ชื่อตารางใน raw SQL ต้องเป็น**ชื่อจริงในฐาน** (snake_case) ไม่ใช่ชื่อ model
  เช่น `FROM "product"` ไม่ใช่ `FROM "Product"` · อันตรายเพราะ SQL เป็น string → **`tsc` กับ `pnpm build` ผ่านฉลุย
  แต่พังตอน runtime** ทุกครั้งที่เปลี่ยน `@@map` ต้องไล่แก้ raw SQL ให้ครบด้วย:
  ```bash
  grep -rn '\$queryRaw\|\$executeRaw' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=generated
  ```
  ปัจจุบันมี raw SQL อยู่ที่ `lib/queries.ts` (6 จุด) และ `app/actions/products.ts` (1 จุด — `nextSku()`)
- **Client Component ที่ใช้ `useSearchParams()` ต้องมี `<Suspense>` ครอบ** ถ้าหน้านั้นถูก prerender แบบ static
  (หน้า auth ทั้งหมดเข้าข่าย) ไม่งั้น `pnpm build` จะพัง
- **Next.js 16** `params`/`searchParams`/`cookies()`/`headers()` เป็น Promise ต้อง `await` ทุกครั้ง
- **รหัสผ่าน PostgreSQL ห้ามมี `/` `:` `@` `#` `?`** — `docker-compose.prod.yml` เสียบ `POSTGRES_PASSWORD`
  ลง connection string ตรง ๆ รหัสผ่าน base64 ที่มี `/` ทำให้ `@prisma/adapter-pg` ฟ้อง `Invalid URL`
  แล้วแอป **ต่อ DB ไม่ได้ทั้งระบบ** (health 503, migration ไม่เคยรัน, DB ว่างไม่มีตาราง) —
  ใช้ base64url แทน: `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`
- **`NEXT_PUBLIC_*` ถูก inline ตอน `next build` เท่านั้น** — ตั้งใน compose ตอน runtime ไม่มีผลกับ bundle
  ฝั่งเบราว์เซอร์ ถ้า CI build โดยไม่ส่ง `--build-arg` ค่า default จะติดไปกับ image (เคยทำให้หน้าเว็บ
  production ยิง auth ไป `http://localhost:3000`) — กันด้วยการ**ไม่ตั้ง `baseURL` ใน `lib/auth-client.ts`**
  (ใช้ path สัมพัทธ์ `/api/auth`) และให้ CI ส่ง build-arg ให้ครบ
- **image `:latest-migrate` ต้อง build จาก stage `migrator` เท่านั้น** — stage `deps` ไม่มี `prisma/`
  ทำให้ `prisma migrate deploy` ฟ้อง "Could not find Prisma Schema" แล้ว deploy "สำเร็จ" ทั้งที่ DB ไม่มีตาราง

## สถานะการพัฒนา

**✅ Phase 1 (Foundation) และ Phase 2 (Core Features) ปิดครบแล้ว** — checkbox ใน `Docs/spec.md` ติ๊กครบทั้งสอง Phase

ของที่ใช้งานได้จริงตอนนี้:
- Auth ครบวงจร: สมัคร / เข้าสู่ระบบ / ลืมรหัสผ่าน / ตั้งรหัสผ่านใหม่ / เปลี่ยนรหัสผ่าน + `proxy.ts` กันทุกหน้า
- คลังสินค้า: CRUD สินค้า (SKU auto-gen), รับเข้า, เบิกจ่าย (กันเบิกเกินแบบ concurrent), Dashboard,
  แจ้งเตือนใกล้หมด + badge, รายงาน 30 วัน, ผู้ใช้งาน, ตั้งค่าโปรไฟล์
- ฐานข้อมูล: `posmobileorderdb` บน container `posmobileorder-postgres` (PostgreSQL 18, port **5437**)
  seed ไว้ 7 รายการ SKU-1001…SKU-1007

**ยังไม่ได้ทำ**: Phase 2.5 (POS Module) · Phase 3–5 (Agentic Quality / Container / Production) ·
Phase 6–12 (MJD Mobile Order) — ลำดับงานทั้งหมดอยู่ที่ [`Docs/spec.md` §8](Docs/spec.md)

เป้าหมายตอนขึ้น production: https://posqr.jayjayservices.com (CI/CD อัตโนมัติจาก `main`,
backup รายวัน + alert ผ่าน `ops/`) — **ยังไม่ได้ deploy**

**ระบบสิทธิ์ตามบทบาท (Role-Based Permission) อยู่นอกขอบเขต v1** — เดิมคือ Phase 2.6 ปัจจุบันยกไปเป็น
"Phase ถัดไป (ยังไม่กำหนดวัน)" ท้าย §8 ของ spec ห้ามเริ่มทำจนกว่า Phase 1–5 จะปิดครบและมีการอนุมัติขอบเขตใหม่
(ดู [`Docs/spec.md` §7 Out of Scope](Docs/spec.md))

ผลจากการที่ v1 ไม่ทำ RBAC — ต้องออกแบบโค้ดให้เป็นแบบนี้ตั้งแต่แรก:

- หน้า `/users` แสดงคอลัมน์บทบาทเป็น "ยังไม่กำหนดสิทธิ์" ทุกแถว เพราะไม่มีตาราง `Role` (และจะไม่มีใน v1)
- `requireUser()` เช็คแค่ว่าล็อกอินอยู่ — v1 ตั้งใจให้เป็นแบบนี้ ไม่ต้องต่อยอดเป็น `requirePermission()`

## 🍽️ MJD Mobile Order (Phase 6–12 — ยังไม่เริ่ม)

Channel ที่สอง (สั่งอาหารผ่าน QR Code สำหรับร้านอาหารแบบ table service) ถูกออกแบบไว้**ครบแล้วใน spec**
แต่ยังไม่ได้ลงมือทำ และ**ต้องทำหลัง Phase 1–5 (ฐาน + POS หน้าร้าน) เสร็จก่อน** เพราะทุกบิลของ Mobile Order
ปิดลงตาราง `Sale`/`SaleItem` ที่สร้างใน Phase 2.5 — เอนทิตี `Table`, `TableSession`, `MenuItem`,
`ModifierGroup`/`ModifierOption`, `MobileOrder`/`MobileOrderItem`, `QRCode`, `Notification`,
`LineNotificationLog`, `StoreSettings`, `Member`/`MemberPointTransaction` และ route `/mobile-order/*`,
`/order/[qrToken]/*` ทั้งหมดเริ่มสร้างที่ Phase 6 (วางฐาน schema/table-session) ตามลำดับใน spec

ที่ที่ต้องดูก่อนเริ่มงานส่วนนี้:
- [`Docs/spec.md` §2 Data Model](Docs/spec.md) — หัวข้อ "MJD Mobile Order — Data Model" (เอนทิตี + enum ใหม่
  ทั้งหมด, การแก้ `Sale`/`PaymentMethod`)
- [`Docs/spec.md` §3](Docs/spec.md) — หัวข้อ "MJD Mobile Order — กติกาธุรกิจ" (เปิด/ปิด/รวมโต๊ะ, สถานะรายการ
  อาหาร + ยกเลิกรายการ, วงจรชีวิต QR, การชำระเงิน/ปิดบิลอัตโนมัติ, LINE, CRM)
- [`Docs/spec.md` §5 F11–F22](Docs/spec.md) — feature + acceptance criteria ทั้งหมด
- [`Docs/spec.md` §6a Routes/UI](Docs/spec.md) — route ฝั่งลูกค้า/พนักงาน/ครัว + หมายเหตุ realtime (Socket.IO
  สำหรับ staff/kitchen, polling สำหรับลูกค้า)
- [`Docs/spec.md` §8 Phase 6–12](Docs/spec.md) — ลำดับงานและกับดักที่คาดไว้ล่วงหน้า (race condition ยกเลิก
  รายการ vs ครัวเริ่มทำ, webhook ซ้ำ/ไม่เรียงลำดับ, dynamic QR reuse-after-payment)

ดูกติกาโค้ดที่ต้องทำตามตั้งแต่เริ่ม Phase 6 ใน [กติกาที่ห้ามละเมิด](#กติกาที่ห้ามละเมิด) ข้อ 7–8 ด้านบน
