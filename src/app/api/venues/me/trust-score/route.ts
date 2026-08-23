import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";
import { computeVenueTrustScore } from "@/lib/venue-trust";

/** Own trust score breakdown + recent feedback — spec §4. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "no_venue" }, { status: 403 });
  }

  const [breakdown, recentFeedback] = await Promise.all([
    computeVenueTrustScore(membership.venueId),
    db.venueFeedback.findMany({
      where: { shift: { venueId: membership.venueId } },
      orderBy: { submittedAt: "desc" },
      take: 20,
      select: {
        id: true,
        paidOnTime: true,
        breaksGiven: true,
        matchedDescription: true,
        comment: true,
        submittedAt: true,
      },
    }),
  ]);

  return NextResponse.json({ breakdown, recentFeedback });
}
