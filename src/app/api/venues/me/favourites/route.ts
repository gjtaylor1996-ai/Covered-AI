import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";

/**
 * Not separately named in spec §4 (only the toggle endpoint is listed),
 * but the prototype's "book again" row (covered.html) needs a list to
 * render from.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const favourites = await db.favourite.findMany({
    where: { venueId: membership.venueId },
    orderBy: { createdAt: "desc" },
    select: {
      worker: {
        select: {
          id: true,
          name: true,
          primaryRole: true,
          hourlyRate: true,
          reliabilityScore: true,
          reliabilityTier: true,
        },
      },
    },
  });

  return NextResponse.json({ favourites: favourites.map((f) => f.worker) });
}
