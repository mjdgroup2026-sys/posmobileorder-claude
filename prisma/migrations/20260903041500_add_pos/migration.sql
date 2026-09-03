-- Phase 2.5 — POS Module
-- เขียนด้วยมือโดยตั้งใจ (ห้ามให้ Prisma generate เอง) เพราะการย้าย product.category (String)
-- ไปเป็น product.categoryId (FK) ต้อง backfill ข้อมูลหมวดหมู่เดิมก่อนลบคอลัมน์
-- มิฉะนั้น Prisma จะสร้าง DROP COLUMN ตรง ๆ แล้วชื่อหมวดหมู่ของสินค้าเดิมหายทั้งหมด

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'QR');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_name_key" ON "category"("name");

-- ย้ายข้อมูล: หมวดหมู่เดิมที่เป็นข้อความอิสระ → master data
INSERT INTO "category" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."category", now(), now()
FROM (SELECT DISTINCT "category" FROM "product") s;

-- AlterTable: product.category (String) → product.categoryId (FK)
ALTER TABLE "product" ADD COLUMN "categoryId" TEXT;

UPDATE "product" p
SET "categoryId" = c."id"
FROM "category" c
WHERE c."name" = p."category";

ALTER TABLE "product" ALTER COLUMN "categoryId" SET NOT NULL;

DROP INDEX "product_category_idx";

ALTER TABLE "product" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "product_categoryId_idx" ON "product"("categoryId");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "sale" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amountReceived" DECIMAL(12,2) NOT NULL,
    "changeDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "cashierId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_item" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_closing" (
    "id" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "closingDate" DATE NOT NULL,
    "totalSales" DECIMAL(12,2) NOT NULL,
    "totalCash" DECIMAL(12,2) NOT NULL,
    "totalTransfer" DECIMAL(12,2) NOT NULL,
    "totalQR" DECIMAL(12,2) NOT NULL,
    "billCount" INTEGER NOT NULL DEFAULT 0,
    "voidedCount" INTEGER NOT NULL DEFAULT 0,
    "countedCash" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashier_closing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_saleNumber_key" ON "sale"("saleNumber");

-- CreateIndex
CREATE INDEX "sale_createdAt_idx" ON "sale"("createdAt");

-- CreateIndex
CREATE INDEX "sale_cashierId_idx" ON "sale"("cashierId");

-- CreateIndex
CREATE INDEX "sale_status_idx" ON "sale"("status");

-- CreateIndex
CREATE INDEX "sale_item_saleId_idx" ON "sale_item"("saleId");

-- CreateIndex
CREATE INDEX "sale_item_productId_idx" ON "sale_item"("productId");

-- CreateIndex
CREATE INDEX "cashier_closing_closingDate_idx" ON "cashier_closing"("closingDate");

-- CreateIndex
CREATE UNIQUE INDEX "cashier_closing_cashierId_closingDate_key" ON "cashier_closing"("cashierId", "closingDate");

-- AlterTable: ผูก ledger กับบิลขาย (null = Stock In/Out ที่คีย์ด้วยมือ)
ALTER TABLE "stock_transaction" ADD COLUMN "saleId" TEXT;

-- CreateIndex
CREATE INDEX "stock_transaction_saleId_idx" ON "stock_transaction"("saleId");

-- AddForeignKey
ALTER TABLE "stock_transaction" ADD CONSTRAINT "stock_transaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_closing" ADD CONSTRAINT "cashier_closing_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
