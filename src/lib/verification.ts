import { getBusinessRules } from "@/config/business-rules";
import type { WorkerRoleKey } from "@/lib/types";

export function roleRequiresDbs(role: WorkerRoleKey): boolean {
  return getBusinessRules().verification.requiresDbsRoles.includes(role);
}

/** Spec §8.6: rate-limit resubmission after a rejection. */
export function isWithinResubmissionCooldown(lastSubmittedAt: Date | null): boolean {
  if (!lastSubmittedAt) return false;
  const { resubmissionCooldownHours } = getBusinessRules().verification;
  const hoursSince = (Date.now() - lastSubmittedAt.getTime()) / (1000 * 60 * 60);
  return hoursSince < resubmissionCooldownHours;
}
