import { db } from "@/lib/db";
import { getBusinessRules } from "@/config/business-rules";
import { getShiftWindow } from "@/lib/shift-time";
import { getStripe } from "@/lib/stripe";
import type { Payment, Shift, Venue } from "@prisma/client";

// Phase 3 (spec §8.1) — "money actually moves, not just gets logged."
// Split-payment pattern from spec §5: platform charges the venue
// (rate + commission), then transfers the worker's rate to their
// Stripe Connect account, keeping the commission as platform revenue.
// This is the simplest correct Connect pattern (separate charges and
// transfers) — not a destination charge, since the venue's card and the
// worker's payout account are on opposite sides of the transaction.

export function computeShiftAmounts(
  shift: Pick<Shift, "startTime" | "endTime" | "hourlyRate">,
  venue?: Pick<Venue, "commissionRateOverride">
) {
  const { start, end } = getShiftWindow(shift as Shift);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const commissionRate =
    venue?.commissionRateOverride ?? getBusinessRules().commissionRate;

  const workerAmountCents = Math.round(shift.hourlyRate * hours * 100);
  const commissionAmountCents = Math.round(workerAmountCents * commissionRate);
  const totalAmountCents = workerAmountCents + commissionAmountCents;

  return { workerAmountCents, commissionAmountCents, totalAmountCents };
}

async function getOrCreatePayment(shift: Shift, venue: Venue): Promise<Payment> {
  const existing = await db.payment.findUnique({ where: { shiftId: shift.id } });
  if (existing) return existing;
  const amounts = computeShiftAmounts(shift, venue);
  return db.payment.create({
    data: { shiftId: shift.id, ...amounts, status: "pending_setup" },
  });
}

/**
 * Attempts to charge the venue and pay out the worker for a completed
 * shift. Called inline from the complete endpoint (no job queue yet —
 * same pattern as score recalculation) and again from
 * POST /shifts/:id/charge as a manual retry. Never throws: a failure
 * here shouldn't break shift completion, since the booking loop has to
 * stay usable even before both sides have finished Stripe onboarding
 * (spec §8.1 lets verification/payments stay partly manual during a
 * pilot).
 */
export async function attemptShiftPayment(shiftId: string): Promise<Payment> {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const [venue, worker] = await Promise.all([
    db.venue.findUniqueOrThrow({ where: { id: shift.venueId } }),
    db.workerProfile.findUniqueOrThrow({ where: { id: shift.workerId! } }),
  ]);
  let payment = await getOrCreatePayment(shift, venue);

  if (payment.status === "charged" || payment.status === "paid_out") {
    return payment; // already handled — never double-charge
  }

  if (!venue.stripeCustomerId || !worker.stripeConnectAccountId || !worker.bankAccountConnected) {
    return db.payment.update({
      where: { id: payment.id },
      data: {
        status: "pending_setup",
        failureReason: !venue.stripeCustomerId
          ? "Venue has not added a payment method yet."
          : "Worker has not finished payout onboarding yet.",
      },
    });
  }

  try {
    const stripe = getStripe();
    payment = await db.payment.update({ where: { id: payment.id }, data: { status: "charging" } });

    let paymentIntentId = payment.stripePaymentIntentId;
    if (!paymentIntentId) {
      const customer = await stripe.customers.retrieve(venue.stripeCustomerId);
      const defaultPaymentMethod =
        !("deleted" in customer) &&
        typeof customer.invoice_settings?.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : null;
      if (!defaultPaymentMethod) {
        return db.payment.update({
          where: { id: payment.id },
          data: { status: "pending_setup", failureReason: "Venue has no default payment method." },
        });
      }

      const intent = await stripe.paymentIntents.create(
        {
          amount: payment.totalAmountCents,
          currency: payment.currency,
          customer: venue.stripeCustomerId,
          payment_method: defaultPaymentMethod,
          off_session: true,
          confirm: true,
          description: `Covered shift ${shift.id}`,
        },
        { idempotencyKey: `charge_${shift.id}` }
      );
      paymentIntentId = intent.id;

      if (intent.status !== "succeeded") {
        return db.payment.update({
          where: { id: payment.id },
          data: {
            status: "failed",
            stripePaymentIntentId: paymentIntentId,
            failureReason: `PaymentIntent ended in status "${intent.status}" — likely needs 3DS authentication, which off-session charges can't complete automatically.`,
          },
        });
      }
    }

    payment = await db.payment.update({
      where: { id: payment.id },
      data: { status: "charged", stripePaymentIntentId: paymentIntentId },
    });

    const transfer = await stripe.transfers.create(
      {
        amount: payment.workerAmountCents,
        currency: payment.currency,
        destination: worker.stripeConnectAccountId,
        transfer_group: `shift_${shift.id}`,
        description: `Covered shift ${shift.id} payout`,
      },
      { idempotencyKey: `transfer_${shift.id}` }
    );

    return db.payment.update({
      where: { id: payment.id },
      data: { status: "paid_out", stripeTransferId: transfer.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    return db.payment.update({
      where: { id: payment.id },
      data: { status: "failed", failureReason: message },
    });
  }
}
