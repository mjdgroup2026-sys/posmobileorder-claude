-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('RETAIL_POS', 'MOBILE_ORDER');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('EMPTY', 'OPEN_NO_ORDER', 'ORDERED', 'AWAITING_BILL', 'OCCUPIED_MERGED');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'AWAITING_BILL', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('AWAITING_KITCHEN', 'COOKING', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QRCodeType" AS ENUM ('STATIC', 'DYNAMIC');

-- CreateEnum
CREATE TYPE "QRCodeStatus" AS ENUM ('ACTIVE', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CALL_STAFF', 'CHECK_BILL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "LineNotificationType" AS ENUM ('ORDER_CONFIRMED', 'FOOD_READY', 'PAYMENT_SUCCESS');

-- CreateEnum
CREATE TYPE "ModifierSelectionType" AS ENUM ('SINGLE', 'MULTIPLE');

-- AlterTable
ALTER TABLE "sale" ADD COLUMN     "channel" "SaleChannel" NOT NULL DEFAULT 'RETAIL_POS',
ADD COLUMN     "tableSessionId" TEXT;

-- CreateTable
CREATE TABLE "restaurant_table" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'EMPTY',
    "primaryTableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_session" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "qrCodeId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredSortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_group" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selectionType" "ModifierSelectionType" NOT NULL DEFAULT 'SINGLE',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modifier_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_option" (
    "id" TEXT NOT NULL,
    "modifierGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modifier_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_order" (
    "id" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_order_item" (
    "id" TEXT NOT NULL,
    "mobileOrderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "selectedOptionsSnapshot" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'AWAITING_KITCHEN',
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_code" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "type" "QRCodeType" NOT NULL DEFAULT 'STATIC',
    "token" TEXT NOT NULL,
    "status" "QRCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "invalidatedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "reason" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_notification_log" (
    "id" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "type" "LineNotificationType" NOT NULL,
    "lineUserId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "line_notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "storeName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    "themeColor" TEXT NOT NULL,
    "hasKDS" BOOLEAN NOT NULL DEFAULT false,
    "serviceChargePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "crmEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pointBalance" INTEGER NOT NULL DEFAULT 0,
    "lineUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_point_transaction" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_point_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_table_code_key" ON "restaurant_table"("code");

-- CreateIndex
CREATE INDEX "restaurant_table_status_idx" ON "restaurant_table"("status");

-- CreateIndex
CREATE INDEX "restaurant_table_primaryTableId_idx" ON "restaurant_table"("primaryTableId");

-- CreateIndex
CREATE INDEX "table_session_tableId_idx" ON "table_session"("tableId");

-- CreateIndex
CREATE INDEX "table_session_status_idx" ON "table_session"("status");

-- CreateIndex
CREATE INDEX "menu_item_isActive_idx" ON "menu_item"("isActive");

-- CreateIndex
CREATE INDEX "menu_item_isFeatured_idx" ON "menu_item"("isFeatured");

-- CreateIndex
CREATE INDEX "modifier_group_menuItemId_idx" ON "modifier_group"("menuItemId");

-- CreateIndex
CREATE INDEX "modifier_option_modifierGroupId_idx" ON "modifier_option"("modifierGroupId");

-- CreateIndex
CREATE INDEX "mobile_order_tableSessionId_idx" ON "mobile_order"("tableSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_order_tableSessionId_orderNumber_key" ON "mobile_order"("tableSessionId", "orderNumber");

-- CreateIndex
CREATE INDEX "mobile_order_item_mobileOrderId_idx" ON "mobile_order_item"("mobileOrderId");

-- CreateIndex
CREATE INDEX "mobile_order_item_status_idx" ON "mobile_order_item"("status");

-- CreateIndex
CREATE UNIQUE INDEX "qr_code_token_key" ON "qr_code"("token");

-- CreateIndex
CREATE INDEX "qr_code_tableId_idx" ON "qr_code"("tableId");

-- CreateIndex
CREATE INDEX "qr_code_status_idx" ON "qr_code"("status");

-- CreateIndex
CREATE INDEX "notification_tableSessionId_idx" ON "notification"("tableSessionId");

-- CreateIndex
CREATE INDEX "notification_status_idx" ON "notification"("status");

-- CreateIndex
CREATE INDEX "line_notification_log_tableSessionId_idx" ON "line_notification_log"("tableSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "member_phone_key" ON "member"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "member_point_transaction_saleId_key" ON "member_point_transaction"("saleId");

-- CreateIndex
CREATE INDEX "member_point_transaction_memberId_idx" ON "member_point_transaction"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_tableSessionId_key" ON "sale"("tableSessionId");

-- CreateIndex
CREATE INDEX "sale_channel_idx" ON "sale"("channel");

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_table" ADD CONSTRAINT "restaurant_table_primaryTableId_fkey" FOREIGN KEY ("primaryTableId") REFERENCES "restaurant_table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session" ADD CONSTRAINT "table_session_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session" ADD CONSTRAINT "table_session_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "qr_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session" ADD CONSTRAINT "table_session_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_group" ADD CONSTRAINT "modifier_group_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_option" ADD CONSTRAINT "modifier_option_modifierGroupId_fkey" FOREIGN KEY ("modifierGroupId") REFERENCES "modifier_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_order" ADD CONSTRAINT "mobile_order_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_order_item" ADD CONSTRAINT "mobile_order_item_mobileOrderId_fkey" FOREIGN KEY ("mobileOrderId") REFERENCES "mobile_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_order_item" ADD CONSTRAINT "mobile_order_item_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_order_item" ADD CONSTRAINT "mobile_order_item_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_code" ADD CONSTRAINT "qr_code_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_notification_log" ADD CONSTRAINT "line_notification_log_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_point_transaction" ADD CONSTRAINT "member_point_transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_point_transaction" ADD CONSTRAINT "member_point_transaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

