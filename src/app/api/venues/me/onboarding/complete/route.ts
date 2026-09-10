import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";

/** Marks the onboarding wizard done — every step is individually skippable. */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "no_venue" }, { status: 403 });
  }

  if (!membership.venue.onboardingCompletedAt) {
    await db.venue.update({
      where: { id: membership.venueId },
      data: { onboardingCompletedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
