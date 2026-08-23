// Commercial figures are illustrative placeholders per the spec, not
// benchmarked business decisions (see CLAUDE.md). Everything here reads
// from env so values can change per environment without a redeploy —
// never hardcode a commission % or fee threshold in application code.

import type { WorkerRoleKey } from "@/lib/types";

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for ${name}: "${raw}"`);
  }
  return parsed;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value for ${name}: "${raw}"`);
  }
  return parsed;
}

export function getBusinessRules() {
  return {
    // Venue commission on shift pay, taken via Stripe Connect (Phase 3).
    commissionRate: envFloat("COMMISSION_RATE", 0.15),

    // Permanent-hire conversion fee tiers, spec §2.4. UK Conduct of
    // Employment Agencies and Employment Businesses Regulations 2003
    // reg. 10 requires the extended-hire alternative always be offered
    // alongside the fee — enforce that pairing in the API layer, not
    // just here.
    hireFee: {
      tier1: {
        maxShifts: envInt("HIRE_FEE_TIER_1_MAX_SHIFTS", 15),
        rate: envFloat("HIRE_FEE_RATE_TIER_1", 0.2),
      },
      tier2: {
        maxShifts: envInt("HIRE_FEE_TIER_2_MAX_SHIFTS", 40),
        rate: envFloat("HIRE_FEE_RATE_TIER_2", 0.12),
      },
      tier3Rate: envFloat("HIRE_FEE_RATE_TIER_3", 0.05),
      extendedHireWeeks: envInt("EXTENDED_HIRE_WEEKS", 8),
    },

    // Reliability score cold-start threshold, scoring model doc §4.
    minShiftsForScore: envInt("MIN_SHIFTS_FOR_SCORE", 10),

    // Reliability Score inputs, spec §2.1 / scoring model doc §3. The
    // spec explicitly calls this formula "illustrative" and says the
    // weights "need to stay tunable per role and per market" (§7) — so
    // every knob below is env-overridable, not a literal constant.
    scoring: {
      // No-shows/lateness inside this window count
      // recencyWeightMultiplier times more than anything older.
      recentWindowDays: envInt("SCORE_RECENT_WINDOW_DAYS", 90),
      recencyWeightMultiplier: envFloat("SCORE_RECENCY_WEIGHT", 3),
      // A worker cancelling a confirmed shift inside this many hours of
      // the start time counts against their score (spec §3.1); outside
      // it, the cancellation doesn't touch the score at all.
      lateCancellationNoticeHours: envInt("LATE_CANCELLATION_NOTICE_HOURS", 4),
      // Lateness beyond this many minutes scores punctuality as 0 for
      // that shift; the spec gives no exact minutes->index conversion,
      // this is a linear cap.
      punctualityLateCapMinutes: envInt("PUNCTUALITY_LATE_CAP_MINUTES", 60),
      // Shift count at which confidence_factor saturates to 1.0. The
      // spec says confidence "scales toward 1.0 as shift count grows"
      // (§3) without giving a target count.
      confidenceSaturationShifts: envInt("CONFIDENCE_SATURATION_SHIFTS", 30),
    },

    // Verification, spec §8.6 / verification doc §1. DBS checks are
    // "only for roles requiring it, e.g. some event or hotel security
    // roles" — the spec never pins down which WorkerRole values that
    // means, so it's configurable rather than a guess baked into logic.
    // resubmissionCooldownHours implements §8.6's "rate-limited... to
    // discourage repeated low-quality submissions" without a specific
    // number given.
    verification: {
      requiresDbsRoles: (process.env.REQUIRES_DBS_ROLES?.split(",").filter(Boolean) as
        | WorkerRoleKey[]
        | undefined) ?? ["EventSteward"],
      resubmissionCooldownHours: envInt("VERIFICATION_RESUBMISSION_COOLDOWN_HOURS", 24),
    },
  };
}

export type BusinessRules = ReturnType<typeof getBusinessRules>;
