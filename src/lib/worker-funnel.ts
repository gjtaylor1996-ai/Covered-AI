import { db } from "@/lib/db";
import { getBusinessRules } from "@/config/business-rules";
import { WORKER_SOURCE_LABELS } from "@/lib/worker-sources";

/**
 * Worker acquisition funnel: how many workers have signed up and how far
 * each has got. Counts only; no worker is identified. Used by the admin
 * Worker funnel page and the weekly summary email so both show the same
 * numbers.
 */
export async function getWorkerFunnel() {
  const workers = await db.workerProfile.findMany({
    select: {
      createdAt: true,
      referralSource: true,
      onboardingCompletedAt: true,
      idVerificationSubmittedAt: true,
      rightToWorkSubmittedAt: true,
      dbsSubmittedAt: true,
      idVerificationStatus: true,
      rightToWorkStatus: true,
      dbsStatus: true,
      shiftsCompleted: true,
      _count: { select: { shifts: true } },
    },
  });

  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  type W = (typeof workers)[number];
  const isApproved = (w: W) =>
    w.idVerificationStatus === "verified" &&
    w.rightToWorkStatus === "verified" &&
    (w.dbsStatus === "verified" || w.dbsStatus === "not_required");
  const startedChecks = (w: W) =>
    Boolean(w.idVerificationSubmittedAt || w.rightToWorkSubmittedAt || w.dbsSubmittedAt);

  const steps = {
    signedUp: workers.length,
    onboarded: workers.filter((w) => w.onboardingCompletedAt).length,
    startedChecks: workers.filter(startedChecks).length,
    approved: workers.filter(isApproved).length,
    gotOffer: workers.filter((w) => w._count.shifts > 0).length,
    completedShift: workers.filter((w) => w.shiftsCompleted > 0).length,
  };

  // Eight rolling 7-day buckets, oldest first; the last one ends now.
  // Bucket i covers (now - (8 - i) * 7 days, now - (7 - i) * 7 days].
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const to = now - (7 - i) * 7 * DAY;
    const from = to - 7 * DAY;
    return {
      weekEnding: new Date(to).toISOString().slice(0, 10),
      signedUp: workers.filter((w) => {
        const t = w.createdAt.getTime();
        return t > from && t <= to;
      }).length,
    };
  });

  const last7Days = workers.filter((w) => now - w.createdAt.getTime() <= 7 * DAY).length;

  const sources: Record<string, { label: string; signedUp: number; approved: number }> = {};
  for (const w of workers) {
    const key = w.referralSource ?? "unknown";
    sources[key] ??= {
      label: key === "unknown" ? "Not given" : WORKER_SOURCE_LABELS[key] ?? key,
      signedUp: 0,
      approved: 0,
    };
    sources[key].signedUp++;
    if (isApproved(w)) sources[key].approved++;
  }

  return {
    steps,
    last7Days,
    weeks,
    sources: Object.entries(sources)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.signedUp - a.signedUp),
    targets: getBusinessRules().workerTargets,
    asOf: new Date().toISOString(),
  };
}

export type WorkerFunnel = Awaited<ReturnType<typeof getWorkerFunnel>>;
