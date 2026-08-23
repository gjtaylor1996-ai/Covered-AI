import { NextRequest, NextResponse } from "next/server";
import { getStripe, getAppUrl } from "@/lib/stripe";

/**
 * Best-effort sync on redirect back from Checkout — the
 * checkout.session.completed webhook (webhooks/stripe/route.ts) is the
 * source of truth, since a venue can close the tab before this fires.
 */
export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (sessionId) {
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent"],
    });
    const setupIntent = checkoutSession.setup_intent;
    const paymentMethod =
      typeof setupIntent !== "string" && setupIntent && typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : null;
    const customerId =
      typeof checkoutSession.customer === "string" ? checkoutSession.customer : null;

    if (paymentMethod && customerId) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethod },
      });
    }
  }

  return NextResponse.redirect(`${appUrl}/venue/shifts`);
}
