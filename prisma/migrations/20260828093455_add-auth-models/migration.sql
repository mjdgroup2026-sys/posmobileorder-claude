-- เปลี่ยนชื่อตารางเป็น snake_case ให้ตรงกับ @@map ในสคีมา
-- ใช้ RENAME แทน DROP+CREATE เพื่อ **รักษาข้อมูลเดิมไว้ทั้งหมด**
-- (Prisma มองการเพิ่ม @@map เป็นตารางใหม่ จึงเสนอ DROP ซึ่งจะทำให้ข้อมูลหาย)

ALTER TABLE "Product" RENAME TO "product";
ALTER TABLE "StockTransaction" RENAME TO "stock_transaction";

-- index / primary key
ALTER INDEX "Product_pkey" RENAME TO "product_pkey";
ALTER INDEX "Product_sku_key" RENAME TO "product_sku_key";
ALTER INDEX "Product_name_idx" RENAME TO "product_name_idx";
ALTER INDEX "Product_category_idx" RENAME TO "product_category_idx";

ALTER INDEX "StockTransaction_pkey" RENAME TO "stock_transaction_pkey";
ALTER INDEX "StockTransaction_productId_idx" RENAME TO "stock_transaction_productId_idx";
ALTER INDEX "StockTransaction_createdAt_idx" RENAME TO "stock_transaction_createdAt_idx";

-- foreign key
ALTER TABLE "stock_transaction"
  RENAME CONSTRAINT "StockTransaction_productId_fkey" TO "stock_transaction_productId_fkey";

-- not-null constraints (PostgreSQL 18 ตั้งชื่อไว้ตามตารางเดิม)
ALTER TABLE "product" RENAME CONSTRAINT "Product_id_not_null" TO "product_id_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_sku_not_null" TO "product_sku_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_name_not_null" TO "product_name_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_category_not_null" TO "product_category_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_unit_not_null" TO "product_unit_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_quantity_not_null" TO "product_quantity_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_reorderPoint_not_null" TO "product_reorderPoint_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_price_not_null" TO "product_price_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_createdAt_not_null" TO "product_createdAt_not_null";
ALTER TABLE "product" RENAME CONSTRAINT "Product_updatedAt_not_null" TO "product_updatedAt_not_null";

ALTER TABLE "stock_transaction" RENAME CONSTRAINT "StockTransaction_id_not_null" TO "stock_transaction_id_not_null";
ALTER TABLE "stock_transaction" RENAME CONSTRAINT "StockTransaction_productId_not_null" TO "stock_transaction_productId_not_null";
ALTER TABLE "stock_transaction" RENAME CONSTRAINT "StockTransaction_type_not_null" TO "stock_transaction_type_not_null";
ALTER TABLE "stock_transaction" RENAME CONSTRAINT "StockTransaction_quantity_not_null" TO "stock_transaction_quantity_not_null";
ALTER TABLE "stock_transaction" RENAME CONSTRAINT "StockTransaction_createdAt_not_null" TO "stock_transaction_createdAt_not_null";
