import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";
import { getBusinessRules } from "@/config/business-rules";
import type { WorkerRoleKey } from "@/lib/types";

// Spec §4: role, maxDistance, minExperience, minReliability, sort.
// maxDistance and minReliability/sort-by-reliability are no-ops until
// geocoding (Phase 5) and the trust layer (Phase 2) land — every worker
// is lat/lng-less and "rising" until then. Filtering by role and
// minExperience is real today.
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (session.role !== "venue_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "no_venue" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") as WorkerRoleKey | null;
  const minExperience = searchParams.get("minExperience");

  const workers = await db.workerProfile.findMany({
    where: {
      ...(role ? { primaryRole: role } : {}),
      ...(minExperience
        ? { yearsExperience: { gte: Number.parseFloat(minExperience) } }
        : {}),
      // A rejected right-to-work or ID check blocks a worker from every
      // search result, full stop — spec §8.6. A rejected DBS only
      // blocks roles that actually require one, not the whole profile.
      rightToWorkStatus: { not: "rejected" },
      idVerificationStatus: { not: "rejected" },
      NOT: {
        dbsStatus: "rejected",
        primaryRole: { in: getBusinessRules().verification.requiresDbsRoles },
      },
    },
    orderBy: { yearsExperience: "desc" },
    select: {
      id: true,
      name: true,
      primaryRole: true,
      yearsExperience: true,
      hourlyRate: true,
      postcode: true,
      maxTravelDistanceMi: true,
      // Score/tier only, never the raw shift log — data minimisation,
      // spec §7.
      reliabilityScore: true,
      reliabilityTier: true,
      shiftsCompleted: true,
    },
  });

  return NextResponse.json({ candidates: workers });
}
