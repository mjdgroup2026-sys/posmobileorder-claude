# การร่วมพัฒนา MJD Mobile Order

ก่อนเริ่ม อ่าน [`CLAUDE.md`](CLAUDE.md) (กติกาที่ห้ามละเมิด + กับดัก) และ [`Docs/spec.md`](Docs/spec.md)
(สัญญาอ้างอิงหลัก) ให้จบก่อนเสมอ — สองไฟล์นั้นคือแหล่งความจริง ไฟล์นี้บอกแค่ **วิธีทำงานร่วมกัน**

---

## 1. Commit message — Conventional Commits

รูปแบบ: `<type>(<scope>): <หัวข้อภาษาไทยหรืออังกฤษ>`

หัวข้อไม่เกิน ~72 ตัวอักษร ไม่ต้องมีจุดปิดท้าย · เนื้อความอธิบาย **"ทำไม"** ไม่ใช่ "ทำอะไร"
(diff บอกอยู่แล้วว่าทำอะไร) · ถ้าแก้บั๊กให้เขียนอาการที่เจอจริงด้วย

### type

| type | ใช้เมื่อ | ตัวอย่าง |
|---|---|---|
| `feat` | ฟีเจอร์ใหม่ที่ผู้ใช้เห็น | `feat(pos): เพิ่มหน้าปิดการขายประจำวัน` |
| `fix` | แก้บั๊ก | `fix(stock): กันเบิกเกินสต็อกเมื่อยิงพร้อมกัน` |
| `refactor` | เปลี่ยนโครงสร้างโค้ดโดยพฤติกรรมเท่าเดิม | `refactor(queries): ย้าย raw SQL มารวมที่ lib/queries.ts` |
| `perf` | เร็วขึ้นโดยพฤติกรรมเท่าเดิม | `perf(dashboard): ตัด N+1 ตอนดึงสินค้าใกล้หมด` |
| `test` | เพิ่ม/แก้เทสอย่างเดียว | `test(stock-out): เพิ่มเทส concurrent 10 คำขอ` |
| `docs` | เอกสารอย่างเดียว | `docs: ติ๊ก checkbox Phase 4 ที่เสร็จแล้ว` |
| `build` | Dockerfile, compose, dependency | `build: เพิ่ม docker-compose.prod.yml` |
| `ci` | ไฟล์ใน `.github/workflows/` | `ci: เติม steps ให้ job test` |
| `chore` | งานจิปาถะที่ไม่เข้าข้างบน | `chore: อัปเดต .gitignore` |

### scope

ใช้ชื่อโดเมนของงาน ไม่ใช่ชื่อไฟล์ — เว้นว่างได้ถ้าแตะหลายส่วน

| scope | ครอบคลุม |
|---|---|
| `auth` | Better Auth, `proxy.ts`, หน้า login/register/reset |
| `stock` | รับเข้า/เบิกจ่าย, `StockTransaction` |
| `products` | สินค้า, SKU, หมวดหมู่ |
| `pos` | ขายหน้าร้าน, บิล, ปิดการขาย |
| `mobile-order` | MJD Mobile Order (โต๊ะ, QR, ครัว, เมนู) |
| `db` | schema, migration, seed |
| `ui` | design token, component ที่ใช้ร่วมกัน |
| `ops` | สคริปต์ใน `ops/`, deploy, backup |

> **ห้าม `--no-verify`** ทุกกรณี ถ้า hook หรือ CI ฟ้อง ให้แก้ต้นเหตุ

---

## 2. ชื่อ branch

`<type>/<คำอธิบายสั้น-คั่นด้วย-ขีด>` — ใช้ type ชุดเดียวกับ commit

```
feat/pos-daily-closing
fix/stock-out-race-condition
ci/add-test-job-steps
```

- ภาษาอังกฤษตัวเล็กล้วน คั่นด้วย `-` ไม่เกิน ~5 คำ
- **ห้าม commit ตรงเข้า `main`** — `main` คือสิ่งที่กำลังรันบน production
  (push เข้า `main` = deploy อัตโนมัติทันที ดู §5)
- branch อายุสั้น ๆ แล้วรีบ merge ดีกว่าปล่อยยาวจน conflict

---

## 3. Checklist ก่อนเปิด PR

ทำให้ครบทุกข้อ **บนเครื่องตัวเอง** ก่อน push — CI ตรวจซ้ำอยู่แล้วแต่ช้ากว่ามาก

- [ ] `pnpm typecheck` ผ่าน
- [ ] `pnpm lint` ผ่าน
- [ ] `pnpm test` ผ่านทั้งหมด
- [ ] **ไม่มี semicolon ปิดท้ายบรรทัด** ในไฟล์ `.ts`/`.tsx`/`.mjs` (กติกาข้อ 1)
      — post-edit hook เตือนให้อยู่แล้ว ตรวจซ้ำด้วย `/check`
- [ ] ข้อความที่ผู้ใช้เห็นเป็น**ภาษาไทยทั้งหมด** รวม validation และ error (กติกาข้อ 6)
- [ ] ถ้าแตะ **สต็อกหรือเงิน** → มีเทสครอบ รวม concurrent (กติกาข้อ 4 และ 7)
- [ ] ถ้าเพิ่ม/แก้ **schema** → มี migration และ `prisma migrate diff --exit-code` ได้
      `No difference detected.`
- [ ] ติ๊ก checkbox ที่ทำเสร็จใน `Docs/spec.md` แล้ว

รันรวดเดียวด้วย `/check` (semicolon → typecheck → lint → build)

---

## 4. รีวิวโค้ด — 5 ข้อเรียงตามความสำคัญ

รีวิวจากบนลงล่าง **เจอปัญหาข้อบนแล้วไม่ต้องไปข้อล่าง** — ข้อ 1 ผิดข้อเดียวกลบข้อดีทั้ง PR

### 1. ความถูกต้องของสต็อกและเงิน (ปฏิเสธทันทีถ้าผิด)

- ทุกการเปลี่ยนยอดสต็อกผ่าน `StockTransaction` และอยู่ใน `prisma.$transaction` เดียวกับ
  การอัปเดต `product.quantity` หรือไม่ (กติกาข้อ 2)
- กันเกินสต็อกด้วย `updateMany` + `where: { quantity: { gte: n } }` ไม่ใช่ `if` ก่อนหน้า
  (กติกาข้อ 4) — **`if` ธรรมดาไม่กัน race condition** และรีวิวเวอร์ต้องเห็นเทส concurrent
- `Decimal` แปลงด้วย `toNumber()` ก่อนส่งเข้า Client Component และเขียนกลับด้วย `toFixed(2)`

### 2. ความปลอดภัย

- ทุก Server Action ที่แตะข้อมูลเรียก `requireUser()` เป็น**บรรทัดแรก** (กติกาข้อ 5)
  — UI ที่ซ่อนปุ่มไม่ใช่การป้องกัน เพราะ Server Action ถูกเรียกตรงได้
- ไม่มี secret/token/รหัสผ่านหลุดเข้าไฟล์ที่ commit
- ไม่พิมพ์ลิงก์ยืนยัน/รีเซ็ตรหัสผ่านลง log บน production

### 3. ความสอดคล้องกับ pattern ของโปรเจกต์

- Server Action คืน `ActionResult` เสมอ ไม่ throw ให้ผู้ใช้เห็น
- ฟังก์ชันอ่านข้อมูลอยู่ใน `lib/queries.ts` (`import 'server-only'`)
- ใช้ class ใน `app/globals.css` ก่อนเขียน Tailwind utility เอง · ไอคอน import จาก
  `components/icons.tsx` เท่านั้น · **ห้าม hex ดิบ** ใช้ `var(--brand)` ฯลฯ (ยกเว้นเทมเพลตอีเมล)

### 4. ประสิทธิภาพ

- ไม่มี N+1 (ใช้ `include`/`select` แทน query ในลูป)
- raw SQL ใช้**ชื่อตารางจริงใน DB** (snake_case) เพราะ `$queryRaw` ไม่ผ่าน `@@map` —
  `tsc` และ `build` ผ่านฉลุยแต่พังตอน runtime

### 5. เทสและความอ่านง่าย

- เทสครอบเส้นทางที่พังได้จริง ไม่ใช่แค่ happy path
- ชื่อตัวแปร/ฟังก์ชันสื่อความหมาย · คอมเมนต์อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร"

---

## 5. สิ่งที่เกิดขึ้นหลัง merge เข้า `main`

push เข้า `main` กระตุ้น [`.github/workflows/ci.yml`](.github/workflows/ci.yml) ทั้งสาย **โดยอัตโนมัติ**:

```
test ─► build-and-push ─► deploy
```

| job | ทำอะไร | ล้มแล้วเกิดอะไร |
|---|---|---|
| `test` | postgres service + `db:generate` → `migrate deploy` → `typecheck` → `test` | หยุดทั้งสาย ไม่ deploy |
| `build-and-push` | build 2 image ส่งขึ้น `ghcr.io` — `:latest` (stage `runner`) และ `:latest-migrate` (stage **`migrator`**) พร้อม tag `:sha-xxxx` | หยุด ไม่ deploy |
| `deploy` | scp `docker-compose.prod.yml` ขึ้น VPS → `pull` → `up -d` → `run --rm migrate` | ของเดิมยังรันอยู่ |

**แปลว่า merge เข้า `main` = ขึ้น production จริงที่ https://posqr.jayjayservices.com ภายในไม่กี่นาที**
ไม่มีขั้นอนุมัติคั่น — ตรวจให้ครบตาม §3 ก่อนเสมอ

ระหว่าง `up -d` คอนเทนเนอร์ถูกสร้างใหม่ **เว็บดาวน์สั้น ๆ ~1 นาที** (zero-downtime blue/green
ยังไม่ได้ทำ อยู่ใน Phase 5) จึงไม่ควร merge ช่วงที่ร้านกำลังใช้งาน

ตรวจผลหลัง deploy: `curl https://posqr.jayjayservices.com/api/health` ต้องได้
`{"status":"ok","database":"up",…}`

---

## 6. ตั้งเครื่องครั้งแรก

```bash
pnpm install
cp .env.example .env          # เติมค่าจริง — DATABASE_URL, BETTER_AUTH_SECRET
pnpm db:generate              # ต้องรีสตาร์ต dev server หลังรันทุกครั้ง
pnpm db:migrate
pnpm db:seed
pnpm dev                      # http://localhost:3001
```

เตรียมฐานสำหรับเทส (แยกจาก dev เด็ดขาด):

```bash
docker exec posmobileorder-postgres psql -U posmobileorderuser -d postgres \
  -c "CREATE DATABASE posmobileorderdb_test;"
pnpm db:test:migrate
pnpm test
```

`.claude/` ถูก commit เข้า git ให้ทีมใช้ร่วมกัน (agents, commands, skills, hooks, settings) —
เปิดโปรเจกต์ด้วย Claude Code แล้วได้ชุดเดียวกันทันที ยกเว้น `.claude/settings.local.json`
ที่เป็นค่าเฉพาะเครื่องแต่ละคน
