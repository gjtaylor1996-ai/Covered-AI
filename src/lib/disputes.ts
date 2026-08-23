import { db } from "@/lib/db";
import type { DisputeCheckType, DisputeTargetType } from "@prisma/client";

// Automated triage, spec §3.2: on creation, classify checkType as
// "objective" if there's a corroborating timestamped source, else
// "subjective" — and NEVER set status. The spec's own examples are "GPS
// clock-in/out" and "payment processor timestamp." GPS was deliberately
// not built (the verification doc §3 explicitly says location data
// should be postcode-level, not live GPS tracking — building clock-in
// GPS would cut against that principle), so the one genuinely available
// objective source here is the Payment record's Stripe timestamps from
// Phase 3. A shift that was actually charged/paid out has independent,
// tamper-resistant evidence of when it happened; a shift with no
// payment record (not yet paid, or Stripe never configured) has only
// the two parties' word for it — subjective, standard review queue.
export async function classifyDispute(
  targetType: DisputeTargetType,
  targetId: string
): Promise<{ checkType: DisputeCheckType; evidence: string | null }> {
  const feedback =
    targetType === "shift_feedback"
      ? await db.shiftFeedback.findUnique({ where: { id: targetId }, select: { shiftId: true } })
      : await db.venueFeedback.findUnique({ where: { id: targetId }, select: { shiftId: true } });

  const shift = feedback
    ? await db.shift.findUnique({ where: { id: feedback.shiftId }, include: { payment: true } })
    : null;
  const payment = shift?.payment;
  if (payment && (payment.status === "charged" || payment.status === "paid_out")) {
    return {
      checkType: "objective",
      evidence: `Stripe PaymentIntent ${payment.stripePaymentIntentId} confirms this shift was charged at ${payment.updatedAt.toISOString()} (status: ${payment.status}).`,
    };
  }

  return { checkType: "subjective", evidence: null };
}

/**
 * Scoring model doc §6: disputed shifts are excluded from the score
 * while under review. What happens after resolution isn't spelled out
 * as explicitly, but the two terminal statuses only make sense read as
 * "resolved_excluded" = the dispute succeeded, so the record stays
 * excluded from scoring; "resolved_upheld" = the original record was
 * correct, so it goes back to counting normally. Excluding on
 * pending_review only (reverting the moment a human decides either way)
 * would make "resolved_excluded" a status that changes nothing, which
 * doesn't fit its name.
 */
export async function getDisputedShiftIds(workerId: string): Promise<Set<string>> {
  const disputes = await db.dispute.findMany({
    where: {
      targetType: "shift_feedback",
      status: { in: ["pending_review", "resolved_excluded"] },
    },
    select: { targetId: true },
  });
  if (disputes.length === 0) return new Set();

  const feedbackIds = disputes.map((d) => d.targetId);
  const feedback = await db.shiftFeedback.findMany({
    where: { id: { in: feedbackIds }, shift: { workerId } },
    select: { shiftId: true },
  });
  return new Set(feedback.map((f) => f.shiftId));
}
