-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'ADD', 'EDIT', 'DELETE');

-- CreateEnum
CREATE TYPE "ResourceKey" AS ENUM ('DASHBOARD', 'PRODUCTS', 'CATEGORIES', 'STOCK_IN', 'STOCK_OUT', 'POS', 'POS_HISTORY', 'POS_CLOSING', 'REPORTS', 'USERS');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" "ResourceKey" NOT NULL,
    "actions" "PermissionAction"[],

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_roleId_resource_key" ON "role_permission"("roleId", "resource");

-- CreateIndex
CREATE INDEX "user_roleId_idx" ON "user"("roleId");

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Seed บทบาทเริ่มต้น 3 บทบาท (§4) + กันผู้ใช้เดิมถูกล็อกออกจากระบบ
--
-- ⚠️ ส่วนนี้เขียนต่อท้ายเองด้วยมือ ไม่ได้มาจาก prisma migrate diff
--    ถ้าไม่มี ผู้ใช้ทุกคนที่มีอยู่จะมี roleId = null ทันทีที่ migration นี้รัน
--    ซึ่งตาม §4 แปลว่า "เข้าได้เฉพาะ /settings" = ล็อกทุกคนออกจากระบบพร้อมกัน
--    รวมถึงผู้ดูแลที่เป็นคนเดียวที่จะแก้สิทธิ์คืนได้ → กู้ไม่ได้ถ้าไม่เข้า DB ตรง ๆ
--
-- id ตั้งเป็นค่าคงที่อ่านออก (ไม่ใช่ cuid) โดยตั้งใจ — migration ต้อง deterministic
-- และโค้ดที่อ้างบทบาทระบบต้องอ้างได้แน่นอนโดยไม่ต้อง query ด้วยชื่อภาษาไทย
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "role" ("id", "name", "description", "isSystem", "createdAt", "updatedAt") VALUES
  ('role_admin',   'ผู้ดูแลระบบ',  'เข้าถึงและจัดการได้ทุกอย่างรวมถึงสิทธิ์ผู้ใช้', true,  NOW(), NOW()),
  ('role_manager', 'ผู้จัดการร้าน', 'จัดการสินค้า สต็อก การขาย และรายงานได้ทั้งหมด',  false, NOW(), NOW()),
  ('role_cashier', 'แคชเชียร์',    'ขายหน้าร้านและปิดยอดได้ ดูข้อมูลอื่นได้อย่างเดียว', false, NOW(), NOW());

-- ผู้ดูแลระบบ: ครบทุก action ที่ resource นั้นรองรับจริง
-- (DASHBOARD/REPORTS มีแค่ VIEW · ledger ไม่มี EDIT/DELETE · POS_HISTORY มี DELETE = void บิล)
INSERT INTO "role_permission" ("id", "roleId", "resource", "actions") VALUES
  ('rp_admin_dashboard',   'role_admin', 'DASHBOARD',   '{VIEW}'),
  ('rp_admin_products',    'role_admin', 'PRODUCTS',    '{VIEW,ADD,EDIT,DELETE}'),
  ('rp_admin_categories',  'role_admin', 'CATEGORIES',  '{VIEW,ADD,EDIT,DELETE}'),
  ('rp_admin_stock_in',    'role_admin', 'STOCK_IN',    '{VIEW,ADD}'),
  ('rp_admin_stock_out',   'role_admin', 'STOCK_OUT',   '{VIEW,ADD}'),
  ('rp_admin_pos',         'role_admin', 'POS',         '{VIEW,ADD}'),
  ('rp_admin_pos_history', 'role_admin', 'POS_HISTORY', '{VIEW,DELETE}'),
  ('rp_admin_pos_closing', 'role_admin', 'POS_CLOSING', '{VIEW,ADD}'),
  ('rp_admin_reports',     'role_admin', 'REPORTS',     '{VIEW}'),
  ('rp_admin_users',       'role_admin', 'USERS',       '{VIEW,ADD,EDIT,DELETE}');

-- ผู้จัดการร้าน: เหมือนผู้ดูแลระบบ ยกเว้น USERS ที่ดูได้อย่างเดียว (แก้สิทธิ์คนอื่นไม่ได้)
INSERT INTO "role_permission" ("id", "roleId", "resource", "actions") VALUES
  ('rp_mgr_dashboard',   'role_manager', 'DASHBOARD',   '{VIEW}'),
  ('rp_mgr_products',    'role_manager', 'PRODUCTS',    '{VIEW,ADD,EDIT,DELETE}'),
  ('rp_mgr_categories',  'role_manager', 'CATEGORIES',  '{VIEW,ADD,EDIT,DELETE}'),
  ('rp_mgr_stock_in',    'role_manager', 'STOCK_IN',    '{VIEW,ADD}'),
  ('rp_mgr_stock_out',   'role_manager', 'STOCK_OUT',   '{VIEW,ADD}'),
  ('rp_mgr_pos',         'role_manager', 'POS',         '{VIEW,ADD}'),
  ('rp_mgr_pos_history', 'role_manager', 'POS_HISTORY', '{VIEW,DELETE}'),
  ('rp_mgr_pos_closing', 'role_manager', 'POS_CLOSING', '{VIEW,ADD}'),
  ('rp_mgr_reports',     'role_manager', 'REPORTS',     '{VIEW}'),
  ('rp_mgr_users',       'role_manager', 'USERS',       '{VIEW}');

-- แคชเชียร์: ขาย/ประวัติ/ปิดยอดได้เต็ม · ดูอย่างเดียวบนสินค้า/หมวดหมู่/แดชบอร์ด/รายงาน
-- · ไม่มีสิทธิ์เลยบนสต็อกและผู้ใช้ (แถวมีอยู่แต่ actions ว่าง → เมนูไม่แสดง)
INSERT INTO "role_permission" ("id", "roleId", "resource", "actions") VALUES
  ('rp_csh_dashboard',   'role_cashier', 'DASHBOARD',   '{VIEW}'),
  ('rp_csh_products',    'role_cashier', 'PRODUCTS',    '{VIEW}'),
  ('rp_csh_categories',  'role_cashier', 'CATEGORIES',  '{VIEW}'),
  ('rp_csh_stock_in',    'role_cashier', 'STOCK_IN',    '{}'),
  ('rp_csh_stock_out',   'role_cashier', 'STOCK_OUT',   '{}'),
  ('rp_csh_pos',         'role_cashier', 'POS',         '{VIEW,ADD}'),
  ('rp_csh_pos_history', 'role_cashier', 'POS_HISTORY', '{VIEW,DELETE}'),
  ('rp_csh_pos_closing', 'role_cashier', 'POS_CLOSING', '{VIEW,ADD}'),
  ('rp_csh_reports',     'role_cashier', 'REPORTS',     '{VIEW}'),
  ('rp_csh_users',       'role_cashier', 'USERS',       '{}');

-- ★ ผู้ใช้ที่มีอยู่ก่อน migration นี้เคยเข้าถึงได้ทุกอย่างอยู่แล้ว (v1 ไม่มี RBAC)
--   จึงยกให้เป็นผู้ดูแลระบบ เพื่อไม่ให้สิทธิ์ "หายไป" เงียบ ๆ ตอน deploy
--   ผู้ใช้ที่สมัครใหม่หลังจากนี้จะได้ roleId = null และต้องรอผู้ดูแลกำหนดบทบาทให้
UPDATE "user" SET "roleId" = 'role_admin' WHERE "roleId" IS NULL;
