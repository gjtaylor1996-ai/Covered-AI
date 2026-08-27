-- DropIndex
DROP INDEX "worker_profiles_onfidoApplicantId_key";

-- AlterTable
ALTER TABLE "worker_profiles" DROP COLUMN "onfidoApplicantId",
DROP COLUMN "onfidoCheckId",
ADD COLUMN     "personaInquiryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "worker_profiles_personaInquiryId_key" ON "worker_profiles"("personaInquiryId");
