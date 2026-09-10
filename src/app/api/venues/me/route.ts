import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";

/** Own venue profile — used to drive the onboarding wizard. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "no_venue" }, { status: 403 });
  }

  const { venue } = membership;
  return NextResponse.json({
    venue: {
      id: venue.id,
      name: venue.name,
      postcode: venue.postcode,
      paymentConnected: Boolean(venue.stripeCustomerId),
      onboardingCompletedAt: venue.onboardingCompletedAt,
    },
  });
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  postcode: z.string().min(1).optional(),
});

/** Venue details step of onboarding — name and postcode. */
export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "no_venue" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const venue = await db.venue.update({ where: { id: membership.venueId }, data: parsed.data });
  return NextResponse.json({
    venue: {
      id: venue.id,
      name: venue.name,
      postcode: venue.postcode,
      paymentConnected: Boolean(venue.stripeCustomerId),
      onboardingCompletedAt: venue.onboardingCompletedAt,
    },
  });
}
