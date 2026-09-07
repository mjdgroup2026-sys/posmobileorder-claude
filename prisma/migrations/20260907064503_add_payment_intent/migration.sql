-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "payment_intent" (
    "id" TEXT NOT NULL,
    "ref1" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intent_ref1_key" ON "payment_intent"("ref1");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intent_transactionId_key" ON "payment_intent"("transactionId");

-- CreateIndex
CREATE INDEX "payment_intent_tableSessionId_idx" ON "payment_intent"("tableSessionId");

-- CreateIndex
CREATE INDEX "payment_intent_status_idx" ON "payment_intent"("status");

-- AddForeignKey
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
