import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";

const WEEKS_OF_TREND = 8;

/**
 * Fill rate, no-show trend, rate benchmark — spec §4. None of the three
 * have an exact formula in the spec, so each is documented here rather
 * than left implicit:
 *  - fillRate: shifts that reached at least accepted, over all shifts
 *    ever posted (same definition as the admin dashboard, §8.2, just
 *    scoped to this venue instead of the whole platform).
 *  - noShowTrend: no-show rate per week over the last 8 weeks, so a
 *    venue manager can see whether it's getting better or worse rather
 *    than one flat number.
 *  - rateBenchmark: this venue's average hourly rate per role vs. the
 *    platform-wide average for that role, computed from every shift
 *    ever posted (not just this venue's) — "am I paying competitively"
 *    only means something next to what everyone else pays.
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

  const [venueShifts, allShifts] = await Promise.all([
    db.shift.findMany({ where: { venueId: membership.venueId } }),
    db.shift.findMany({ select: { role: true, hourlyRate: true } }),
  ]);

  const filled = venueShifts.filter((s) => !["open", "offered", "declined"].includes(s.status));
  const fillRate = venueShifts.length > 0 ? filled.length / venueShifts.length : null;

  const now = new Date();
  const noShowTrend = Array.from({ length: WEEKS_OF_TREND }, (_, i) => {
    const weeksAgo = WEEKS_OF_TREND - 1 - i;
    const weekStart = new Date(now.getTime() - (weeksAgo + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now.getTime() - weeksAgo * 7 * 24 * 60 * 60 * 1000);
    const weekShifts = venueShifts.filter(
      (s) =>
        (s.status === "completed" || s.status === "no_show") &&
        s.date >= weekStart &&
        s.date < weekEnd
    );
    const noShows = weekShifts.filter((s) => s.status === "no_show").length;
    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      noShowRate: weekShifts.length > 0 ? noShows / weekShifts.length : null,
      shiftCount: weekShifts.length,
    };
  });

  const venueRolesPosted = [...new Set(venueShifts.map((s) => s.role))];
  const rateBenchmark = venueRolesPosted.map((role) => {
    const venueRates = venueShifts.filter((s) => s.role === role).map((s) => s.hourlyRate);
    const platformRates = allShifts.filter((s) => s.role === role).map((s) => s.hourlyRate);
    const avg = (nums: number[]) => nums.reduce((sum, n) => sum + n, 0) / nums.length;
    return {
      role,
      venueAvgRate: Math.round(avg(venueRates) * 100) / 100,
      platformAvgRate: Math.round(avg(platformRates) * 100) / 100,
    };
  });

  return NextResponse.json({ fillRate, noShowTrend, rateBenchmark });
}
