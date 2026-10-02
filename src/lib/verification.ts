import { getBusinessRules } from "@/config/business-rules";
import type { WorkerRoleKey } from "@/lib/types";

export function roleRequiresDbs(role: WorkerRoleKey): boolean {
  return getBusinessRules().verification.requiresDbsRoles.includes(role);
}

const RIGHT_TO_WORK_SENSITIVE_FIELDS = [
  "rightToWorkShareCode",
  "rightToWorkDob",
  "rightToWorkNationality",
  "rightToWorkPassportNumber",
] as const;

/** Right-to-work values are only ever returned to admins, decrypted, via the verification queue. */
export function withoutRightToWorkData<T extends object>(
  worker: T
): Omit<T, (typeof RIGHT_TO_WORK_SENSITIVE_FIELDS)[number]> {
  const copy = { ...worker } as Record<string, unknown>;
  for (const field of RIGHT_TO_WORK_SENSITIVE_FIELDS) delete copy[field];
  return copy as Omit<T, (typeof RIGHT_TO_WORK_SENSITIVE_FIELDS)[number]>;
}

/**
 * Only fully checked workers can be found and offered shifts: approved ID and
 * right-to-work, plus an approved DBS for roles that require one. A pending
 * or rejected check both exclude — the worker stays out of search until an
 * admin approves them (spec §8.6).
 */
export function verifiedWorkerWhere() {
  return {
    rightToWorkStatus: "verified" as const,
    idVerificationStatus: "verified" as const,
    OR: [
      { primaryRole: { notIn: getBusinessRules().verification.requiresDbsRoles } },
      { dbsStatus: "verified" as const },
    ],
  };
}

export function isFullyVerified(worker: {
  primaryRole: WorkerRoleKey;
  rightToWorkStatus: string;
  idVerificationStatus: string;
  dbsStatus: string;
}): boolean {
  return (
    worker.rightToWorkStatus === "verified" &&
    worker.idVerificationStatus === "verified" &&
    (!roleRequiresDbs(worker.primaryRole) || worker.dbsStatus === "verified")
  );
}

/** Spec §8.6: rate-limit resubmission after a rejection. */
export function isWithinResubmissionCooldown(lastSubmittedAt: Date | null): boolean {
  if (!lastSubmittedAt) return false;
  const { resubmissionCooldownHours } = getBusinessRules().verification;
  const hoursSince = (Date.now() - lastSubmittedAt.getTime()) / (1000 * 60 * 60);
  return hoursSince < resubmissionCooldownHours;
}
