---
description: วางแผนและลงมือทำฟีเจอร์ใหม่ตามกติกาโปรเจกต์ (วิเคราะห์ schema/spec ก่อน แล้วรอยืนยัน plan)
argument-hint: <ชื่อฟีเจอร์ที่ต้องการ>
---

ฟีเจอร์ที่ต้องทำ: **$ARGUMENTS**

## ขั้นที่ 1 — วิเคราะห์ก่อน (ห้ามเขียนโค้ดในขั้นนี้)

อ่าน 3 แหล่งนี้ให้ครบก่อนตัดสินใจอะไรทั้งสิ้น:

- @prisma/schema.prisma — มี model/enum อะไรอยู่แล้วบ้าง ฟีเจอร์นี้ใช้ของเดิมได้ไหม
- @CLAUDE.md — กติกาที่ห้ามละเมิด, pattern, กับดัก, ธีม/design system, สถานะการพัฒนา
- @docs/spec.md — ฟีเจอร์นี้อยู่ใน Phase ไหน มี acceptance criteria เขียนไว้แล้วหรือยัง

แล้วสรุปออกมาเป็นหัวข้อสั้น ๆ:

1. **กระทบ model ไหนบ้าง** — แยกให้ชัดว่า *ใช้ของเดิม* / *เพิ่มฟิลด์* / *เพิ่ม model หรือ enum ใหม่*
   ถ้าต้องแก้ schema ให้ระบุด้วยว่าต้องมี migration หรือไม่ (ถ้ามี → ใช้ `/migration` ห้ามรัน
   `prisma migrate dev` เองแบบสุ่มสี่สุ่มห้า และห้ามให้ Prisma generate migration ของ `@@map` เอง)
2. **อยู่ Phase ไหนของ spec** — ถ้าฟีเจอร์นี้ถูกกั้นไว้ (เช่น Role-Based Permission ที่อยู่นอกขอบเขต v1
   หรือ Phase 6+ ที่ยังไม่ถึงคิว) ให้ **หยุดแล้วแจ้งผู้ใช้** ห้ามเริ่มเอง
3. **ไฟล์ที่ต้องแตะ** — action / query / page / component / test
4. **กติกาที่เกี่ยวข้อง** — ระบุเลขข้อจาก "กติกาที่ห้ามละเมิด" ใน CLAUDE.md ที่ฟีเจอร์นี้ต้องระวังเป็นพิเศษ
   (เช่น แตะสต็อก → ข้อ 2, 3, 4 · แตะ `MobileOrderItem.status` → ข้อ 7 · ออกบิล Mobile Order → ข้อ 8)

## ขั้นที่ 2 — แสดง plan เป็น checklist แล้ว **รอการยืนยัน**

แสดง plan รูปแบบนี้ แล้ว**หยุดรอให้ผู้ใช้ตอบว่า "ok / ทำเลย" ก่อน ห้ามลงมือเอง**:

```markdown
## Plan: <ชื่อฟีเจอร์>

**กระทบ model:** <รายชื่อ + ต้อง migrate หรือไม่>
**Phase:** <ตาม docs/spec.md>

- [ ] 1. …
- [ ] 2. …
- [ ] 3. เขียนเทส (บังคับถ้าฟีเจอร์แตะสต็อกหรือเงิน — รวมเทส concurrent)
- [ ] 4. อัปเดต `docs/spec.md` — ติ๊ก checkbox ข้อที่ทำเสร็จ + เพิ่ม/แก้ acceptance criteria ถ้าขอบเขตเปลี่ยน
- [ ] 5. รัน `/check`
```

⚠️ **เตือนผู้ใช้ทุกครั้ง** ว่า `docs/spec.md` คือสัญญาอ้างอิงหลัก — งานยังไม่ถือว่าเสร็จจนกว่าจะติ๊ก
checkbox และแก้ spec ให้ตรงกับสิ่งที่ทำจริง

## ขั้นที่ 3 — ลงมือ (หลังได้รับการยืนยันแล้วเท่านั้น)

ทำตาม checklist ทีละข้อ โดยต้องผ่านกฎเหล่านี้ทั้งหมด:

- **ห้ามใส่ semicolon** ในไฟล์ `.ts`/`.tsx` ทุกไฟล์ (กติกาข้อ 1)
- **TypeScript strict** — ห้าม `any`, ห้าม `@ts-ignore`, ห้าม non-null assertion (`!`) มั่ว ๆ
  ถ้าค่าอาจเป็น null ให้ narrow ด้วย type guard จริง ๆ
- **ทุกงานที่เขียน DB ต้องเป็น Server Action ที่คืน `ActionResult`** และ**ห้าม throw ให้ผู้ใช้เห็น**
  โครงตาม `/action` (เรียก `requireUser()` เป็นบรรทัดแรก → `safeParse` → เขียน DB → `revalidatePath` →
  `return { ok: true, message: '…' }`)
- **ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด** รวม validation และ error
- อ่านข้อมูลผ่าน `lib/queries.ts` · zod schema อยู่ที่ `lib/validation.ts` ไม่ประกาศ inline
- UI ใช้ class จาก `app/globals.css` ก่อนเขียน Tailwind utility เอง · ห้ามใส่ hex ดิบ · ไอคอน import จาก
  `components/icons.tsx` เท่านั้น
- Decimal จาก Prisma ต้อง `toNumber()` ก่อนส่งเข้า Client Component

เสร็จแล้วรัน `/check` แล้วรายงานว่าอัปเดต `docs/spec.md` ข้อไหนไปบ้าง
