import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";

/**
 * Internal signup spreadsheet data — one row per worker and one row per
 * venue signup, with onboarding/verification/payment status. Reads
 * straight from the database on every request, so it's always current
 * as of the moment the page is opened. Not in the spec; ops visibility
 * into acquisition, same funnel the growth plan tracks.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [workerUsers, venueAdminUsers] = await Promise.all([
    db.user.findMany({
      where: { role: "worker" },
      select: {
        id: true,
        email: true,
        createdAt: true,
        workerProfile: {
          select: {
            name: true,
            primaryRole: true,
            onboardingCompletedAt: true,
            idVerificationStatus: true,
            rightToWorkStatus: true,
            dbsStatus: true,
            bankAccountConnected: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({
      where: { role: "venue_admin" },
      select: {
        id: true,
        email: true,
        createdAt: true,
        venueMemberships: {
          take: 1,
          select: {
            venue: {
              select: { name: true, onboardingCompletedAt: true, stripeCustomerId: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const workers = workerUsers.map((u) => ({
    id: u.id,
    name: u.workerProfile?.name ?? "—",
    email: u.email,
    role: u.workerProfile?.primaryRole ?? null,
    createdAt: u.createdAt,
    onboarded: Boolean(u.workerProfile?.onboardingCompletedAt),
    verified:
      u.workerProfile?.idVerificationStatus === "verified" &&
      u.workerProfile?.rightToWorkStatus === "verified" &&
      (u.workerProfile?.dbsStatus === "verified" || u.workerProfile?.dbsStatus === "not_required"),
    payoutConnected: Boolean(u.workerProfile?.bankAccountConnected),
  }));

  const venues = venueAdminUsers.map((u) => {
    const venue = u.venueMemberships[0]?.venue;
    return {
      id: u.id,
      name: venue?.name || "—",
      email: u.email,
      createdAt: u.createdAt,
      onboarded: Boolean(venue?.onboardingCompletedAt),
      paymentConnected: Boolean(venue?.stripeCustomerId),
    };
  });

  return NextResponse.json({ workers, venues });
}
