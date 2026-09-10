-- AlterTable
ALTER TABLE "worker_profiles" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: a worker that already has a real postcode has clearly
-- already done some setup — don't force it back through the wizard.
UPDATE "worker_profiles" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP WHERE "postcode" <> '';
