import { db } from "@/lib/db";
import type { ReliabilityTier } from "@prisma/client";

// Venue Trust Score — spec §2.3. Same shape as the Reliability Score
// "deliberately, for consistency across both sides of the marketplace,"
// and tiered with the same thresholds (§2.1). Unlike the worker score,
// the spec gives no recency weighting or cold-start rule for this one —
// implemented here as a plain rate over all VenueFeedback the venue has
// received, with the same reliabilityTier thresholds. If the product
// wants a cold-start "rising" tier for new venues too, that's a
// deliberate addition beyond what §2.3 specifies, not implemented here.

function tierForScore(score: number): ReliabilityTier {
  if (score >= 93) return "top_rated";
  if (score >= 80) return "reliable";
  return "rising";
}

interface TrustBreakdown {
  paidOnTimeRate: number;
  breaksGivenRate: number;
  matchedDescriptionRate: number;
  trustScore: number | null;
  trustTier: ReliabilityTier;
  feedbackCount: number;
}

export async function computeVenueTrustScore(venueId: string): Promise<TrustBreakdown> {
  const feedback = await db.venueFeedback.findMany({
    where: { shift: { venueId } },
    select: { paidOnTime: true, breaksGiven: true, matchedDescription: true },
  });

  if (feedback.length === 0) {
    return {
      paidOnTimeRate: 1,
      breaksGivenRate: 1,
      matchedDescriptionRate: 1,
      trustScore: null,
      trustTier: "rising",
      feedbackCount: 0,
    };
  }

  const rate = (pick: (f: (typeof feedback)[number]) => boolean) =>
    feedback.filter(pick).length / feedback.length;

  const paidOnTimeRate = rate((f) => f.paidOnTime);
  const breaksGivenRate = rate((f) => f.breaksGiven);
  const matchedDescriptionRate = rate((f) => f.matchedDescription);

  const trustScore = Math.round(
    ((paidOnTimeRate + breaksGivenRate + matchedDescriptionRate) / 3) * 100
  );

  return {
    paidOnTimeRate,
    breaksGivenRate,
    matchedDescriptionRate,
    trustScore,
    trustTier: tierForScore(trustScore),
    feedbackCount: feedback.length,
  };
}

/** Triggered on new VenueFeedback per spec §6 — inline until there's a job queue. */
export async function recalculateVenueTrustScore(venueId: string): Promise<void> {
  const breakdown = await computeVenueTrustScore(venueId);
  await db.venue.update({
    where: { id: venueId },
    data: { trustScore: breakdown.trustScore, trustTier: breakdown.trustTier },
  });
}
