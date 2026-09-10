-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: a venue that already has a real postcode has clearly
-- already done some setup — don't force it back through the wizard.
UPDATE "venues" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP WHERE "postcode" <> '';
