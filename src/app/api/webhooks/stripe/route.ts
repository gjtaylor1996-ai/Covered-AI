import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

/**
 * Source of truth for account/payment-method state — the return-URL
 * handlers (connect/return, setup-checkout/return) do a best-effort
 * sync too, but a closed tab or failed redirect shouldn't leave the
 * account permanently out of sync. Signature verification needs the
 * raw body, hence request.text() rather than request.json().
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await db.workerProfile.updateMany({
        where: { stripeConnectAccountId: account.id },
        data: { bankAccountConnected: account.payouts_enabled ?? false },
      });
      break;
    }

    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      if (checkoutSession.mode === "setup") {
        const setupIntentId =
          typeof checkoutSession.setup_intent === "string" ? checkoutSession.setup_intent : null;
        const customerId =
          typeof checkoutSession.customer === "string" ? checkoutSession.customer : null;
        if (setupIntentId && customerId) {
          const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
          const paymentMethod =
            typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : null;
          if (paymentMethod) {
            await stripe.customers.update(customerId, {
              invoice_settings: { default_payment_method: paymentMethod },
            });
          }
        }
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await db.payment.updateMany({
        where: { stripePaymentIntentId: intent.id },
        data: {
          status: "failed",
          failureReason: intent.last_payment_error?.message ?? "Payment failed.",
        },
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
