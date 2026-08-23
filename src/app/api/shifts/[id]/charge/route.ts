import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";
import { attemptShiftPayment } from "@/lib/payments";

/**
 * Manual retry for a shift whose payment is stuck in "pending_setup" or
 * "failed" — not in the spec's original API surface, added because
 * attemptShiftPayment runs automatically once on completion (in
 * shifts/[id]/complete) but has no way to re-trigger itself once both
 * sides finish Stripe onboarding after the fact.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const shift = await db.shift.findUnique({ where: { id: params.id } });
  if (!shift || shift.venueId !== membership.venueId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (shift.status !== "completed") {
    return NextResponse.json(
      { error: "shift_not_completed", status: shift.status },
      { status: 409 }
    );
  }

  const payment = await attemptShiftPayment(shift.id);
  return NextResponse.json({ payment });
}
