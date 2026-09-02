# สรุปการเปลี่ยนแปลง

<!-- ทำอะไร และ "ทำไม" — diff บอกอยู่แล้วว่าทำอะไร ถ้าแก้บั๊กให้เขียนอาการที่เจอจริงด้วย -->

เกี่ยวข้องกับ: <!-- Docs/spec.md Phase X / F-xx / issue # -->

---

## ตรวจแล้วบนเครื่องตัวเอง

- [ ] `pnpm typecheck` ผ่าน
- [ ] `pnpm lint` ผ่าน
- [ ] `pnpm test` ผ่านทั้งหมด
- [ ] ไม่มี semicolon ปิดท้ายบรรทัดในไฟล์ `.ts`/`.tsx`/`.mjs` (กติกาข้อ 1)
- [ ] ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด รวม validation และ error (กติกาข้อ 6)
- [ ] ติ๊ก checkbox ที่ทำเสร็จใน `Docs/spec.md` แล้ว

---

## ถ้าแตะสต็อกหรือเงิน

<!-- ลบทั้งหัวข้อได้ถ้า PR นี้ไม่แตะ -->

- [ ] การเปลี่ยนยอดสต็อกทุกจุดผ่าน `StockTransaction` และอยู่ใน `prisma.$transaction`
      เดียวกับการอัปเดต `product.quantity` (กติกาข้อ 2)
- [ ] ไม่มีการแก้ `product.quantity` ตรง ๆ จากที่อื่น (รวมฟอร์มแก้ไขสินค้า)
- [ ] `StockTransaction` ยังเป็น append-only — ไม่มีการลบ/แก้ย้อนหลัง (กติกาข้อ 3)
- [ ] กันเกินสต็อกด้วย `updateMany` + `where: { quantity: { gte: n } }` **ไม่ใช่ `if` ก่อนหน้า**
      (กติกาข้อ 4)
- [ ] **มีเทส concurrent พิสูจน์** เช่น ยิงพร้อมกัน 10 คำขอจากสต็อก 8 → ผ่านแค่ 4 และยอดไม่ติดลบ
- [ ] `Decimal` แปลงด้วย `toNumber()` ก่อนส่งเข้า Client Component และเขียนกลับด้วย `toFixed(2)`

เลขที่พิสูจน์ได้จากเทส: <!-- เช่น "สต็อก 8 ยิง 10 คำขอ → สำเร็จ 4 คงเหลือ 0" -->

---

## ถ้าเพิ่ม/แก้ Server Action

<!-- ลบทั้งหัวข้อได้ถ้า PR นี้ไม่แตะ -->

- [ ] เรียก `requireUser()` เป็น**บรรทัดแรก** ของทุก action ที่แตะข้อมูล (กติกาข้อ 5)
- [ ] คืน `ActionResult` เสมอ ไม่ throw ให้ผู้ใช้เห็น
- [ ] validate ด้วย zod แล้วส่ง `fieldErrors` กลับให้ฟอร์มแสดงใต้ช่องกรอก
- [ ] เรียก `revalidatePath()` ครบทุกหน้าที่ได้รับผลกระทบ
- [ ] ฝั่ง client เช็ค `result.ok` → `toast` → `router.refresh()`

---

## ถ้าแตะ schema / migration

<!-- ลบทั้งหัวข้อได้ถ้า PR นี้ไม่แตะ -->

- [ ] `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
      ได้ `No difference detected.`
- [ ] **ถ้าเพิ่ม/แก้ `@@map`** — เขียน `migration.sql` เองเป็น `ALTER TABLE ... RENAME TO ...`
      ไม่ปล่อยให้ Prisma generate เอง (มันสร้าง `DROP TABLE` + `CREATE TABLE` = **ข้อมูลหายหมด**)
      และ rename index / PK / FK / not-null constraint ให้ครบ
- [ ] ไล่แก้ raw SQL ให้ครบ — `$queryRaw` ไม่ผ่าน `@@map` ต้องใช้ชื่อตารางจริงใน DB
      ```bash
      grep -rn '\$queryRaw\|\$executeRaw' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=generated
      ```
- [ ] ยืนยันจากฐานจริงด้วย `\dt` ก่อน `migrate resolve --applied`

---

## ผลกระทบตอน deploy

merge เข้า `main` = **ขึ้น production จริงทันที** (`test` → `build-and-push` → `deploy`)
ที่ https://posqr.jayjayservices.com ไม่มีขั้นอนุมัติคั่น

- [ ] มี migration ที่ต้องรันบน production หรือไม่ — ถ้ามี ปลอดภัยกับข้อมูลที่มีอยู่แล้วไหม
- [ ] ต้องเพิ่ม/แก้ตัวแปรใน `.env` บน VPS ก่อน deploy หรือไม่
      (CI **ไม่ copy `.env` ขึ้นไป** ต้องแก้บนเครื่องเอง ไม่งั้น compose ล้มที่ guard `:?`)
- [ ] ต้องแก้ `docker-compose.prod.yml` / nginx / DNS ด้วยหรือไม่
- [ ] ย้อนกลับได้อย่างไรถ้าพัง

ระหว่าง `up -d` คอนเทนเนอร์ถูกสร้างใหม่ **เว็บดาวน์ ~1 นาที** — ระบุด้วยว่าเหมาะจะ merge ตอนไหน

ตรวจหลัง deploy: `curl https://posqr.jayjayservices.com/api/health` ต้องได้ `"status":"ok"`

---

## หมายเหตุถึงผู้รีวิว

<!-- จุดที่อยากให้ดูเป็นพิเศษ, ทางเลือกที่ตัดสินใจไปแล้วและเหตุผล, สิ่งที่ยังค้าง -->
