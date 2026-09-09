-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "chargeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transferAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "venueChargeFailed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "venueChargeFailureReason" TEXT;
