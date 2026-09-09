-- CreateEnum
CREATE TYPE "RightToWorkMethod" AS ENUM ('share_code', 'manual_document');

-- AlterTable
ALTER TABLE "worker_profiles" ADD COLUMN     "rightToWorkMethod" "RightToWorkMethod",
ADD COLUMN     "rightToWorkNationality" TEXT,
ADD COLUMN     "rightToWorkPassportNumber" TEXT;
