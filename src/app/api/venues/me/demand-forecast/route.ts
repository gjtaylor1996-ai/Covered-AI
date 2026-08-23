import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";

const HISTORY_WEEKS = 12;

/**
 * Predicted shift demand, next 7 days — spec §4. The spec names this
 * endpoint but gives no forecasting method, and there's no ML pipeline
 * anywhere in this codebase to build one against. This is a naive
 * seasonal average: for each of the next 7 calendar days, count how
 * many shifts this venue posted on that day of the week over the last
 * 12 weeks and average it. Genuinely predictive in the sense that it's
 * derived from real historical pattern rather than a random number, but
 * it's a baseline worth explicitly labelling as such — not a real
 * forecasting model, and it has nothing to say until a venue has
 * several weeks of posting history.
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

  const since = new Date(Date.now() - HISTORY_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const history = await db.shift.findMany({
    where: { venueId: membership.venueId, createdAt: { gte: since } },
    select: { date: true },
  });

  const countsByDayOfWeek = new Array(7).fill(0);
  for (const shift of history) {
    countsByDayOfWeek[shift.date.getUTCDay()] += 1;
  }
  const weeksOfDataSeen = Math.max(
    1,
    Math.ceil((Date.now() - since.getTime()) / (7 * 24 * 60 * 60 * 1000))
  );

  const forecast = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const dayOfWeek = day.getUTCDay();
    return {
      date: day.toISOString().slice(0, 10),
      predictedShifts: Math.round((countsByDayOfWeek[dayOfWeek] / weeksOfDataSeen) * 10) / 10,
    };
  });

  return NextResponse.json({
    forecast,
    basis: `Average shifts posted per day-of-week over the last ${weeksOfDataSeen} week(s) of history — a simple seasonal baseline, not a predictive model.`,
  });
}
