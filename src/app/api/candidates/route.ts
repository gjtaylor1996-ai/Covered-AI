import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";
import { getBusinessRules } from "@/config/business-rules";
import { computeMatchScore, KITCHEN_ROLES, KITCHEN_ROLE_GROUP } from "@/lib/matching";
import type { WeeklyAvailability, WorkerRoleKey } from "@/lib/types";

// Spec §4: role, maxDistance, minExperience, minReliability, sort.
// maxDistance is a no-op until geocoding is built — it's not tied to
// any specific phase in §8.1's table, and every worker is lat/lng-less
// until it lands. minReliability/reliability-sort/match-sort are real
// now that the trust layer (Phase 2) is in. `role` also accepts the
// prototype's "__kitchen__" group (covered.html's quick actions) and
// `availability=weekend` matches its "Weekend cover" quick action.
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
  const role = searchParams.get("role");
  const minExperience = searchParams.get("minExperience");
  const minReliability = searchParams.get("minReliability");
  const sort = searchParams.get("sort"); // "match" | "reliability" | "experience" (default)
  const availability = searchParams.get("availability"); // "weekend"

  const roleFilter =
    role === KITCHEN_ROLE_GROUP
      ? { primaryRole: { in: KITCHEN_ROLES } }
      : role
        ? { primaryRole: role as WorkerRoleKey }
        : {};

  const workers = await db.workerProfile.findMany({
    where: {
      ...roleFilter,
      ...(minExperience
        ? { yearsExperience: { gte: Number.parseFloat(minExperience) } }
        : {}),
      // A null (below-minimum, "rising") score doesn't satisfy a
      // minimum-reliability filter — Prisma's numeric comparison
      // against a nullable field already excludes nulls, so this falls
      // out naturally rather than needing a separate null check.
      ...(minReliability
        ? { reliabilityScore: { gte: Number.parseFloat(minReliability) } }
        : {}),
      // Suspended accounts (spec §8.2 admin action) shouldn't be
      // discoverable, even though they aren't rejected on any single
      // verification check.
      user: { suspendedAt: null },
      // A rejected right-to-work or ID check blocks a worker from every
      // search result, full stop — spec §8.6. A rejected DBS only
      // blocks roles that actually require one, not the whole profile.
      rightToWorkStatus: { not: "rejected" },
      idVerificationStatus: { not: "rejected" },
      NOT: {
        dbsStatus: "rejected",
        primaryRole: { in: getBusinessRules().verification.requiresDbsRoles },
      },
      // Spec §3.3: accepting a hire request removes the worker from
      // that venue's active casual search results — they're a direct
      // employee there now — while leaving their profile intact for
      // every other venue (this filter is venue-scoped, not global).
      hireRequests: { none: { venueId: membership.venueId, status: "accepted" } },
    },
    orderBy: sort === "experience" ? { yearsExperience: "desc" } : undefined,
    select: {
      id: true,
      name: true,
      primaryRole: true,
      yearsExperience: true,
      hourlyRate: true,
      postcode: true,
      maxTravelDistanceMi: true,
      availability: true,
      // Score/tier only, never the raw shift log — data minimisation,
      // spec §7.
      reliabilityScore: true,
      reliabilityTier: true,
      shiftsCompleted: true,
      favouritedBy: { where: { venueId: membership.venueId }, select: { id: true } },
    },
  });

  const filtered =
    availability === "weekend"
      ? workers.filter((w) => {
          const a = w.availability as unknown as WeeklyAvailability;
          return a.saturday?.enabled || a.sunday?.enabled;
        })
      : workers;

  const { minShiftsForScore, newWorkerMaxShiftValueCents } = getBusinessRules();
  const withMatchScore = filtered
    .map((w) => {
      const { availability: _availability, favouritedBy, ...rest } = w;
      return {
        ...rest,
        isFavourite: favouritedBy.length > 0,
        matchScore: computeMatchScore(w),
        // Cold-start flag, not spec: this worker can't be offered a
        // shift worth more than newWorkerMaxShiftValueCents (enforced
        // server-side in the offer endpoint) — surfaced here so venues
        // aren't surprised by the block. See business-rules.ts.
        isNewWorker: w.shiftsCompleted < minShiftsForScore,
      };
    })
    .sort((a, b) => {
      if (sort === "reliability") return (b.reliabilityScore ?? -1) - (a.reliabilityScore ?? -1);
      if (sort === "experience") return 0; // already ordered by the DB query
      return b.matchScore - a.matchScore; // default: best match first
    });

  return NextResponse.json({ candidates: withMatchScore, newWorkerMaxShiftValueCents });
}
