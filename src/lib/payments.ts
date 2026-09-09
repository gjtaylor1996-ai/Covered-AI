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
 * Charges the venue and pays out the worker for a completed shift — as
 * two independent operations, not a sequential pipeline. Called inline
 * from the complete endpoint (no job queue yet — same pattern as score
 * recalculation) and again from POST /shifts/:id/charge as a manual
 * retry. Never throws: a failure here shouldn't break shift completion.
 *
 * Regulation 15 of the Conduct of Employment Agencies and Employment
 * Businesses Regulations 2003 requires Covered to undertake to pay a
 * worker for a shift "whether or not" the venue has paid Covered — so
 * the worker payout is attempted regardless of whether the venue charge
 * succeeded, not gated behind it. A failed venue charge becomes a
 * collections problem for Covered (venueChargeFailed), never the
 * worker's problem. See Terms of Service, Section 5.
 *
 * Each Stripe call's idempotency key includes an attempt counter
 * (chargeAttempts / transferAttempts), not just the shift id — a static
 * key would make every retry after a genuine failure replay Stripe's
 * cached failure response forever instead of actually retrying.
 */
export async function attemptShiftPayment(shiftId: string): Promise<Payment> {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const [venue, worker] = await Promise.all([
    db.venue.findUniqueOrThrow({ where: { id: shift.venueId } }),
    db.workerProfile.findUniqueOrThrow({ where: { id: shift.workerId! } }),
  ]);
  let payment = await getOrCreatePayment(shift, venue);
  const stripe = getStripe();

  // The worker payout is the non-negotiable leg — if the worker isn't
  // even payable yet, there's nothing to attempt on either side.
  if (!worker.stripeConnectAccountId || !worker.bankAccountConnected) {
    if (payment.status === "paid_out") return payment;
    return db.payment.update({
      where: { id: payment.id },
      data: { status: "pending_setup", failureReason: "Worker has not finished payout onboarding yet." },
    });
  }

  // --- Venue charge: independent, allowed to fail without blocking the worker's payout below ---
  if (!payment.stripePaymentIntentId || payment.venueChargeFailed) {
    if (!venue.stripeCustomerId) {
      payment = await db.payment.update({
        where: { id: payment.id },
        data: { venueChargeFailed: true, venueChargeFailureReason: "Venue has not added a payment method yet." },
      });
    } else {
      try {
        const customer = await stripe.customers.retrieve(venue.stripeCustomerId);
        const defaultPaymentMethod =
          !("deleted" in customer) &&
          typeof customer.invoice_settings?.default_payment_method === "string"
            ? customer.invoice_settings.default_payment_method
            : null;

        if (!defaultPaymentMethod) {
          payment = await db.payment.update({
            where: { id: payment.id },
            data: { venueChargeFailed: true, venueChargeFailureReason: "Venue has no default payment method." },
          });
        } else {
          const attempt = payment.chargeAttempts + 1;
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
            { idempotencyKey: `charge_${shift.id}_${attempt}` }
          );

          payment = await db.payment.update({
            where: { id: payment.id },
            data:
              intent.status === "succeeded"
                ? {
                    stripePaymentIntentId: intent.id,
                    chargeAttempts: attempt,
                    venueChargeFailed: false,
                    venueChargeFailureReason: null,
                  }
                : {
                    stripePaymentIntentId: intent.id,
                    chargeAttempts: attempt,
                    venueChargeFailed: true,
                    venueChargeFailureReason: `PaymentIntent ended in status "${intent.status}" — likely needs 3DS authentication, which off-session charges can't complete automatically.`,
                  },
          });
        }
      } catch (err) {
        const attempt = payment.chargeAttempts + 1;
        const message = err instanceof Error ? err.message : "Unknown Stripe error charging the venue.";
        payment = await db.payment.update({
          where: { id: payment.id },
          data: { chargeAttempts: attempt, venueChargeFailed: true, venueChargeFailureReason: message },
        });
      }
    }
  }

  // --- Worker payout: always attempted if not already paid, independent of the venue charge above ---
  if (payment.status === "paid_out") return payment;

  try {
    const attempt = payment.transferAttempts + 1;
    const transfer = await stripe.transfers.create(
      {
        amount: payment.workerAmountCents,
        currency: payment.currency,
        destination: worker.stripeConnectAccountId,
        transfer_group: `shift_${shift.id}`,
        description: `Covered shift ${shift.id} payout`,
      },
      { idempotencyKey: `transfer_${shift.id}_${attempt}` }
    );
    return db.payment.update({
      where: { id: payment.id },
      data: { status: "paid_out", stripeTransferId: transfer.id, transferAttempts: attempt, failureReason: null },
    });
  } catch (err) {
    const attempt = payment.transferAttempts + 1;
    const message = err instanceof Error ? err.message : "Unknown Stripe error paying the worker.";
    return db.payment.update({
      where: { id: payment.id },
      data: { status: "failed", failureReason: message, transferAttempts: attempt },
    });
  }
}
