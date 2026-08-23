import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";
import { getStripe, getAppUrl } from "@/lib/stripe";

/**
 * Starts a Stripe Checkout session (mode: setup) so a venue can save a
 * card for off-session commission charges — a hosted redirect rather
 * than embedding Stripe Elements, to keep the frontend dependency-free.
 * Not in the spec's original API surface; Phase 3 (§8.1) commission
 * collection can't happen without a saved payment method.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const stripe = getStripe();
  const appUrl = getAppUrl();

  let customerId = membership.venue.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: membership.venue.name,
      metadata: { venueId: membership.venueId },
    });
    customerId = customer.id;
    await db.venue.update({ where: { id: membership.venueId }, data: { stripeCustomerId: customerId } });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    payment_method_types: ["card"],
    success_url: `${appUrl}/api/venues/me/stripe/setup-checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/venue/shifts`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
