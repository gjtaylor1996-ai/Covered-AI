import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership, getWorkerProfile } from "@/lib/permissions";
import { getShiftWindow } from "@/lib/shift-time";
import { getBusinessRules } from "@/config/business-rules";

// Not in the spec's original API surface (§4 only lists offer/respond/
// complete/rate-venue) — but the state machine (§3.1) explicitly allows
// confirmed -> cancelled_by_worker | cancelled_by_venue, and the
// Reliability Score formula (§2) needs late-cancellation data to ever
// have real values, so this endpoint has to exist for the trust layer
// to be testable. Same category of spec gap as the missing "declined
// offer" reopen path from Phase 1.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const shift = await db.shift.findUnique({ where: { id: params.id } });
  if (!shift) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (shift.status !== "confirmed") {
    return NextResponse.json(
      { error: "shift_not_confirmed", status: shift.status },
      { status: 409 }
    );
  }

  if (session.role === "worker") {
    const worker = await getWorkerProfile(session.userId);
    if (!worker || shift.workerId !== worker.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Spec §3.1: inside the notice-period threshold counts against the
    // score; outside it, cancelling doesn't touch the score at all.
    const { lateCancellationNoticeHours } = getBusinessRules().scoring;
    const { start } = getShiftWindow(shift);
    const noticeHours = (start.getTime() - Date.now()) / (1000 * 60 * 60);
    const lateCancellation = noticeHours < lateCancellationNoticeHours;

    const updated = await db.shift.update({
      where: { id: shift.id },
      data: { status: "cancelled_by_worker", lateCancellation },
    });
    return NextResponse.json({ shift: updated });
  }

  // Venue cancelling never affects the worker's score — two-sided
  // accountability, scoring doc §6.
  const membership = await getVenueMembership(session.userId);
  if (!membership || membership.venueId !== shift.venueId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const updated = await db.shift.update({
    where: { id: shift.id },
    data: { status: "cancelled_by_venue" },
  });
  return NextResponse.json({ shift: updated });
}
