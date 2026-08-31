---
description: สร้างและรัน Prisma migration อย่างปลอดภัย
argument-hint: <ชื่อ migration เช่น add_category>
---

สร้าง migration ชื่อ `$1` ตามขั้นตอนนี้:

1. อ่าน `prisma/schema.prisma` ยืนยันว่าการเปลี่ยนแปลงตรงกับที่ต้องการจริง และตรงกับ §2 Data Model ใน `Docs/spec.md`
2. รัน `pnpm exec prisma migrate dev --name $1`
3. **อ่าน warning ให้ครบก่อนตอบตกลงเสมอ** — ถ้าขึ้นว่า `about to drop the ... table, which is not empty`
   แปลว่า **ข้อมูลจะหาย ห้ามปล่อยผ่าน** กรณีที่เจอบ่อยคือการเพิ่ม/แก้ `@@map` ซึ่ง Prisma ไม่รู้จักว่าเป็น rename
   ให้เขียน migration เองแทน:
   1. `mkdir prisma/migrations/<timestamp>_$1/` แล้วเขียน `migration.sql` เป็น `ALTER TABLE ... RENAME TO ...`
      พร้อม rename **index / primary key / foreign key / not-null constraint** ให้ครบทุกตัว
   2. รันด้วย psql โดยตรง (ในทรานแซคชันเดียว จะได้ rollback ทั้งชุดถ้าพลาด):
      `docker exec -i posmobileorder-postgres psql -U posmobileorderuser -d posmobileorderdb -v ON_ERROR_STOP=1 --single-transaction < <ไฟล์>`
   3. **ตรวจ `\dt` ในฐานจริงว่าเปลี่ยนแล้วจริง** ก่อนค่อย `pnpm exec prisma migrate resolve --applied <timestamp>_$1`
      > ⚠️ ห้ามใช้ `prisma db execute --file` — มันพ่นหน้า help แล้ว exit 0 โดยไม่รันอะไรเลย
      > ถ้าเผลอ `resolve` ต่อจะได้สถานะพัง: migration ถูกบันทึกว่า applied ทั้งที่ SQL ยังไม่ได้รัน
4. **ถ้าล้มเพราะ non-interactive** (มี warning แต่ไม่ใช่เรื่องข้อมูลหาย เช่นเพิ่ม unique constraint) ให้แก้ข้อมูล
   ที่ขัด constraint ให้เรียบร้อยก่อน แล้ว migrate ใหม่
5. **ถ้าแก้ `@@map`**: ต้องไล่แก้ raw SQL ที่อ้างชื่อตารางตรง ๆ ด้วย เพราะ `$queryRaw` **ไม่ผ่าน `@@map`**
   (build ผ่านแต่พังตอน runtime):
   ```bash
   grep -rn '\$queryRaw\|\$executeRaw' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=generated
   ```
6. รัน `pnpm db:generate` แล้ว **เตือนผู้ใช้ให้รีสตาร์ต dev server** (Turbopack จะใช้ module graph เก่า
   ทำให้เขียน DB "สำเร็จ" แต่ไม่มีแถวถูกบันทึกจริง)
7. ยืนยันปิดงานด้วย 2 คำสั่งนี้ **ต้องผ่านทั้งคู่**:
   - `pnpm exec prisma migrate status` → `Database schema is up to date!`
   - `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
     → `No difference detected.`

รายงานไฟล์ migration ที่ถูกสร้าง, SQL ที่รันจริง, และจำนวนแถวก่อน/หลังถ้าเป็นการ rename
