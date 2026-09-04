-- Phase 10 — ชำระเงิน MJD Mobile Order (PromptPay webhook + Card/EDC) และปิดบิลอัตโนมัติ
--
-- เขียนด้วยมือเพราะการทำให้ sale_item รองรับทั้งสินค้าหน้าร้านและเมนูของ Mobile Order ต้อง
-- backfill คอลัมน์ name จากชื่อสินค้าปัจจุบันก่อน แล้วจึงปลด NOT NULL ของ productId
-- ถ้าปล่อยให้ Prisma generate จะได้ ALTER ... SET NOT NULL บนคอลัมน์ที่ยังว่าง แล้ว migration ล้ม

-- AlterEnum: วิธีชำระเงินใหม่ที่ใช้เฉพาะช่องทาง MOBILE_ORDER
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PROMPTPAY';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CARD';

-- AlterTable: อ้างอิงการชำระเงินจากผู้ให้บริการ (กัน webhook ซ้ำ)
ALTER TABLE "sale" ADD COLUMN "paymentReference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sale_paymentReference_key" ON "sale"("paymentReference");

-- AlterTable: sale_item รองรับทั้ง Product (หน้าร้าน) และ MenuItem (Mobile Order)
ALTER TABLE "sale_item" ADD COLUMN "menuItemId" TEXT;
ALTER TABLE "sale_item" ADD COLUMN "name" TEXT;

UPDATE "sale_item" i
SET "name" = p."name"
FROM "product" p
WHERE p."id" = i."productId";

-- แถวที่หาสินค้าไม่เจอ (ไม่ควรมี เพราะ FK เดิมบังคับอยู่) ใส่ค่าแทนไว้ไม่ให้ SET NOT NULL ล้ม
UPDATE "sale_item" SET "name" = 'ไม่ทราบชื่อรายการ' WHERE "name" IS NULL;

ALTER TABLE "sale_item" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "sale_item" ALTER COLUMN "productId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "sale_item_menuItemId_idx" ON "sale_item"("menuItemId");

-- AddForeignKey
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
