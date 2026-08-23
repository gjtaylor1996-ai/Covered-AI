-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending_setup', 'charging', 'charged', 'paid_out', 'failed');

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "worker_profiles" ADD COLUMN     "stripeConnectAccountId" TEXT;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "workerAmountCents" INTEGER NOT NULL,
    "commissionAmountCents" INTEGER NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'gbp',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending_setup',
    "stripePaymentIntentId" TEXT,
    "stripeTransferId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_shiftId_key" ON "payments"("shiftId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "venues_stripeCustomerId_key" ON "venues"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_profiles_stripeConnectAccountId_key" ON "worker_profiles"("stripeConnectAccountId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

