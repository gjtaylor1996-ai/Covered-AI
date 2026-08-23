-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('worker', 'venue_admin', 'admin');

-- CreateEnum
CREATE TYPE "WorkerRole" AS ENUM ('Bartender', 'WaiterWaitress', 'HeadChef', 'SousChef', 'ChefDePartie', 'CommisChef', 'KitchenPorter', 'EventSteward', 'Housekeeper', 'Barista', 'FrontOfHouseManager');

-- CreateEnum
CREATE TYPE "ReliabilityTier" AS ENUM ('rising', 'reliable', 'top_rated');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "DbsStatus" AS ENUM ('pending', 'verified', 'rejected', 'not_required');

-- CreateEnum
CREATE TYPE "CertType" AS ENUM ('food_hygiene_l2', 'food_hygiene_l3', 'personal_licence', 'silver_service', 'first_aid', 'sia_badge', 'barista_l1', 'barista_l2', 'cellar_management', 'coshh', 'wine_basics', 'allergen_trained');

-- CreateEnum
CREATE TYPE "CertStatus" AS ENUM ('pending', 'verified', 'expired');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('pay_as_you_go', 'growth', 'enterprise');

-- CreateEnum
CREATE TYPE "VenueMemberRole" AS ENUM ('owner', 'manager', 'staff');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'offered', 'accepted', 'declined', 'confirmed', 'completed', 'no_show', 'cancelled_by_worker', 'cancelled_by_venue');

-- CreateEnum
CREATE TYPE "DisputeRaisedBy" AS ENUM ('worker', 'venue');

-- CreateEnum
CREATE TYPE "DisputeTargetType" AS ENUM ('shift_feedback', 'venue_feedback');

-- CreateEnum
CREATE TYPE "DisputeCheckType" AS ENUM ('objective', 'subjective');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('pending_review', 'resolved_upheld', 'resolved_excluded');

-- CreateEnum
CREATE TYPE "FeeOption" AS ENUM ('conversion_fee', 'extended_hire');

-- CreateEnum
CREATE TYPE "HireRequestStatus" AS ENUM ('pending_worker_response', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('reviewer', 'ops_manager', 'super_admin');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryRole" "WorkerRole" NOT NULL,
    "yearsExperience" DOUBLE PRECISION NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "postcode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "maxTravelDistanceMi" DOUBLE PRECISION NOT NULL,
    "availability" JSONB NOT NULL,
    "rightToWorkStatus" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "idVerificationStatus" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "dbsStatus" "DbsStatus" NOT NULL DEFAULT 'not_required',
    "reliabilityScore" DOUBLE PRECISION,
    "reliabilityTier" "ReliabilityTier" NOT NULL DEFAULT 'rising',
    "shiftsCompleted" INTEGER NOT NULL DEFAULT 0,
    "noShows" INTEGER NOT NULL DEFAULT 0,
    "consentGivenAt" TIMESTAMP(3),
    "bankAccountConnected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" "CertType" NOT NULL,
    "status" "CertStatus" NOT NULL DEFAULT 'pending',
    "expiryDate" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'pay_as_you_go',
    "trustScore" DOUBLE PRECISION,
    "trustTier" "ReliabilityTier" NOT NULL DEFAULT 'rising',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_members" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "VenueMemberRole" NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "venue_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "workerId" TEXT,
    "role" "WorkerRole" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',
    "distanceAtMatchMi" DOUBLE PRECISION,
    "offeredAt" TIMESTAMP(3),
    "respondBy" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_feedback" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "confirmedAttendance" BOOLEAN NOT NULL,
    "onTime" BOOLEAN NOT NULL,
    "minutesLate" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_feedback" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "paidOnTime" BOOLEAN NOT NULL,
    "breaksGiven" BOOLEAN NOT NULL,
    "matchedDescription" BOOLEAN NOT NULL,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "raisedBy" "DisputeRaisedBy" NOT NULL,
    "targetType" "DisputeTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "checkType" "DisputeCheckType",
    "evidence" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'pending_review',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favourites" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hire_requests" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "proposedRoleTitle" TEXT NOT NULL,
    "proposedSalary" DOUBLE PRECISION NOT NULL,
    "proposedStartDate" TIMESTAMP(3) NOT NULL,
    "feeOption" "FeeOption" NOT NULL,
    "feeAmount" DOUBLE PRECISION,
    "shiftsCompletedAtRequest" INTEGER NOT NULL,
    "status" "HireRequestStatus" NOT NULL DEFAULT 'pending_worker_response',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hire_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "worker_profiles_userId_key" ON "worker_profiles"("userId");

-- CreateIndex
CREATE INDEX "certifications_workerId_idx" ON "certifications"("workerId");

-- CreateIndex
CREATE INDEX "venue_members_userId_idx" ON "venue_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "venue_members_venueId_userId_key" ON "venue_members"("venueId", "userId");

-- CreateIndex
CREATE INDEX "shifts_venueId_idx" ON "shifts"("venueId");

-- CreateIndex
CREATE INDEX "shifts_workerId_idx" ON "shifts"("workerId");

-- CreateIndex
CREATE INDEX "shifts_status_idx" ON "shifts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shift_feedback_shiftId_key" ON "shift_feedback"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "venue_feedback_shiftId_key" ON "venue_feedback"("shiftId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_checkType_idx" ON "disputes"("checkType");

-- CreateIndex
CREATE UNIQUE INDEX "favourites_venueId_workerId_key" ON "favourites"("venueId", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_userId_key" ON "admin_users"("userId");

-- CreateIndex
CREATE INDEX "terms_acceptances_userId_idx" ON "terms_acceptances"("userId");

-- AddForeignKey
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_members" ADD CONSTRAINT "venue_members_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_members" ADD CONSTRAINT "venue_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_feedback" ADD CONSTRAINT "shift_feedback_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_feedback" ADD CONSTRAINT "venue_feedback_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hire_requests" ADD CONSTRAINT "hire_requests_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hire_requests" ADD CONSTRAINT "hire_requests_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
