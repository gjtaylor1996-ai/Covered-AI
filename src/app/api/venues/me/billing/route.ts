import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";
import { getBusinessRules } from "@/config/business-rules";

/**
 * Venue-facing billing summary: payment method status, the effective
 * commission rate (negotiated override or platform default — see
 * Venue.commissionRateOverride), and charge history across every shift.
 * Payment has no direct venueId (it hangs off Shift), so this joins
 * through shift like the per-shift payment section already does.
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

  const venue = membership.venue;
  const payments = await db.payment.findMany({
    where: { shift: { venueId: venue.id } },
    include: { shift: { select: { id: true, role: true, date: true } } },
    orderBy: { shift: { date: "desc" } },
  });

  const commissionRate = venue.commissionRateOverride ?? getBusinessRules().commissionRate;

  return NextResponse.json({
    paymentMethodConnected: venue.stripeCustomerId !== null,
    commissionRate,
    isNegotiatedRate: venue.commissionRateOverride !== null,
    charges: payments.map((p) => ({
      id: p.id,
      shiftId: p.shift.id,
      role: p.shift.role,
      date: p.shift.date,
      totalAmountCents: p.totalAmountCents,
      commissionAmountCents: p.commissionAmountCents,
      status: p.status,
      venueChargeFailed: p.venueChargeFailed,
      venueChargeFailureReason: p.venueChargeFailureReason,
    })),
  });
}
