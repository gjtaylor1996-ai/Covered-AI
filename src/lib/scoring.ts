import { db } from "@/lib/db";
import { getBusinessRules } from "@/config/business-rules";
import { getDisputedShiftIds } from "@/lib/disputes";
import type { ReliabilityTier } from "@prisma/client";

// Reliability Score engine — spec §2.1, reasoning in
// reference/docs/covered-reliability-scoring-model.md. The spec calls
// this formula "illustrative" and flags several sub-terms (the exact
// minutes-late -> punctuality_index curve, the confidence saturation
// point) without giving exact numbers, so those live as named,
// env-overridable constants in src/config/business-rules.ts rather than
// invented magic numbers here — see the comments on each for the
// specific gap being filled.
//
// Two data-model notes worth flagging for product/spec review rather
// than silently resolved:
//
// 1. The scoring doc lists "completed shifts vs. no-shows" (35%) and
//    "venue confirmation after shift" (20%) as two distinct signals,
//    but the data model has exactly one relevant field for both —
//    ShiftFeedback.confirmedAttendance. There's no second, independent
//    "confirmation" signal to compute venue_confirmation_rate from. To
//    avoid inventing a fake second field, this implementation computes
//    attendance_rate_weighted with recency weighting (the "35%" no-show
//    signal) and venue_confirmation_rate as the plain, unweighted rate
//    over the same underlying field (the "20%" signal) — mechanically
//    different, but sourced from the same boolean. Revisit if the
//    product wants a genuinely separate confirmation signal.
//
// 2. The scoring doc describes a graduated "late cancellation" tier
//    (implying cancellations somewhere between 4h and 48h notice are
//    penalised less than a true no-show), but spec §3.1's actual state
//    machine only defines a binary rule: cancelling inside the 4-hour
//    notice threshold counts against the score, outside it doesn't
//    affect the score at all. This implementation follows the binary
//    §3.1 rule (it's the one with an actual number attached) and treats
//    late_cancellation_rate as the rate of inside-threshold
//    cancellations specifically — not a third middle tier.

interface ScoreBreakdown {
  attendanceRateWeighted: number;
  punctualityIndex: number;
  lateCancellationRate: number;
  venueConfirmationRate: number;
  confidenceFactor: number;
  rawScore: number;
  reliabilityScore: number | null; // null until minShiftsForScore
  reliabilityTier: ReliabilityTier;
  shiftsCompleted: number;
  noShows: number;
  plainLanguageSummary: string;
}

function tierForScore(score: number): ReliabilityTier {
  if (score >= 93) return "top_rated";
  if (score >= 80) return "reliable";
  return "rising";
}

function recencyWeight(date: Date, now: Date, windowDays: number, multiplier: number) {
  const ageDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays <= windowDays ? multiplier : 1;
}

export async function computeReliabilityScore(
  workerId: string
): Promise<ScoreBreakdown> {
  const rules = getBusinessRules();
  const { recentWindowDays, recencyWeightMultiplier, punctualityLateCapMinutes, confidenceSaturationShifts } =
    rules.scoring;
  const now = new Date();

  const [allCompletedShifts, lateCancelShifts, disputedShiftIds] = await Promise.all([
    db.shift.findMany({
      where: { workerId, status: { in: ["completed", "no_show"] } },
      include: { shiftFeedback: true },
    }),
    db.shift.findMany({
      where: { workerId, status: "cancelled_by_worker", lateCancellation: true },
      select: { createdAt: true },
    }),
    getDisputedShiftIds(workerId),
  ]);
  // Scoring model doc §6: a shift with a pending or successful dispute
  // (resolved_excluded) doesn't count toward the score — see
  // getDisputedShiftIds for why resolved_upheld puts it back in.
  const completedShifts = allCompletedShifts.filter((s) => !disputedShiftIds.has(s.id));
  const lateCancellations = lateCancelShifts.length;

  const attendanceCountedShifts = completedShifts.length + lateCancellations;

  // 35% — attendance_rate_weighted: recent no-shows (and in-window late
  // cancellations) count recencyWeightMultiplier times an old one.
  let weightedTotal = 0;
  let weightedBad = 0;
  for (const shift of completedShifts) {
    const w = recencyWeight(shift.date, now, recentWindowDays, recencyWeightMultiplier);
    weightedTotal += w;
    if (shift.status === "no_show") weightedBad += w;
  }
  // Late cancellations aren't in completedShifts (no ShiftFeedback), so
  // weight them by cancellation time via createdAt as the best available
  // recency signal.
  for (const shift of lateCancelShifts) {
    const w = recencyWeight(shift.createdAt, now, recentWindowDays, recencyWeightMultiplier);
    weightedTotal += w;
    weightedBad += w;
  }
  const attendanceRateWeighted = weightedTotal > 0 ? 1 - weightedBad / weightedTotal : 1;

  // 20% — punctuality_index: per-shift lateness capped and averaged,
  // same recency weighting applied for consistency with attendance.
  let punctualityWeightedTotal = 0;
  let punctualityWeightedScore = 0;
  for (const shift of completedShifts) {
    if (!shift.shiftFeedback) continue;
    const w = recencyWeight(shift.date, now, recentWindowDays, recencyWeightMultiplier);
    const minutesLate = shift.shiftFeedback.onTime ? 0 : (shift.shiftFeedback.minutesLate ?? 0);
    const latenessScore = Math.max(0, 1 - minutesLate / punctualityLateCapMinutes);
    punctualityWeightedTotal += w;
    punctualityWeightedScore += w * latenessScore;
  }
  const punctualityIndex =
    punctualityWeightedTotal > 0 ? punctualityWeightedScore / punctualityWeightedTotal : 1;

  // 15% — late_cancellation_rate: see interpretation note above.
  const lateCancellationRate =
    attendanceCountedShifts > 0 ? lateCancellations / attendanceCountedShifts : 0;

  // 20% — venue_confirmation_rate: plain (unweighted) confirmation rate.
  const confirmedCount = completedShifts.filter(
    (s) => s.shiftFeedback?.confirmedAttendance
  ).length;
  const venueConfirmationRate =
    completedShifts.length > 0 ? confirmedCount / completedShifts.length : 1;

  // 10% — confidence_factor: saturates to 1.0 as shift count grows.
  const shiftsCompletedCount = completedShifts.filter((s) => s.status === "completed").length;
  const confidenceFactor = Math.min(shiftsCompletedCount / confidenceSaturationShifts, 1);

  const rawScore =
    0.35 * attendanceRateWeighted +
    0.2 * punctualityIndex +
    0.15 * (1 - lateCancellationRate) +
    0.2 * venueConfirmationRate +
    0.1 * confidenceFactor;

  const numericScore = Math.round(rawScore * 100);
  const noShowCount = completedShifts.filter((s) => s.status === "no_show").length;

  const belowMinimum = shiftsCompletedCount < rules.minShiftsForScore;
  const reliabilityScore = belowMinimum ? null : numericScore;
  const reliabilityTier: ReliabilityTier = belowMinimum ? "rising" : tierForScore(numericScore);

  const plainLanguageSummary = belowMinimum
    ? `${shiftsCompletedCount} completed shift${shiftsCompletedCount === 1 ? "" : "s"} so far — not enough history for a full score yet.`
    : `${shiftsCompletedCount} completed shifts, ${noShowCount} no-show${noShowCount === 1 ? "" : "s"} logged, ${Math.round(venueConfirmationRate * 100)}% confirmed on booking.`;

  return {
    attendanceRateWeighted,
    punctualityIndex,
    lateCancellationRate,
    venueConfirmationRate,
    confidenceFactor,
    rawScore,
    reliabilityScore,
    reliabilityTier,
    shiftsCompleted: shiftsCompletedCount,
    noShows: noShowCount,
    plainLanguageSummary,
  };
}

/** Triggered on new ShiftFeedback per spec §6 — no job queue yet, so this runs inline. */
export async function recalculateReliabilityScore(workerId: string): Promise<void> {
  const breakdown = await computeReliabilityScore(workerId);
  await db.workerProfile.update({
    where: { id: workerId },
    data: {
      reliabilityScore: breakdown.reliabilityScore,
      reliabilityTier: breakdown.reliabilityTier,
    },
  });
}
