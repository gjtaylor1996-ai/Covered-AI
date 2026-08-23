-- AlterTable
ALTER TABLE "worker_profiles" ADD COLUMN     "dbsApplicationRef" TEXT,
ADD COLUMN     "dbsSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "idVerificationSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "onfidoApplicantId" TEXT,
ADD COLUMN     "onfidoCheckId" TEXT,
ADD COLUMN     "rightToWorkDob" TIMESTAMP(3),
ADD COLUMN     "rightToWorkShareCode" TEXT,
ADD COLUMN     "rightToWorkSubmittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_log_targetType_targetId_idx" ON "admin_audit_log"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_profiles_onfidoApplicantId_key" ON "worker_profiles"("onfidoApplicantId");

