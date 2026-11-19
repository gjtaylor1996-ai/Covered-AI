import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";
import { getBusinessRules } from "@/config/business-rules";
import { WORKER_SOURCE_LABELS } from "@/lib/worker-sources";

/**
 * Worker acquisition funnel for the admin Worker funnel page: how many
 * workers have signed up, and how far each has got. Counts only; no worker
 * is identified, and nothing here is shown to venues or workers. Reads
 * straight from the database on every request.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

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

  const isApproved = (w: (typeof workers)[number]) =>
    w.idVerificationStatus === "verified" &&
    w.rightToWorkStatus === "verified" &&
    (w.dbsStatus === "verified" || w.dbsStatus === "not_required");
  const startedChecks = (w: (typeof workers)[number]) =>
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
  const buckets = Array.from({ length: 8 }, (_, i) => {
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

  const { workerTargets } = getBusinessRules();

  return NextResponse.json({
    steps,
    last7Days,
    weeks: buckets,
    sources: Object.entries(sources)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.signedUp - a.signedUp),
    targets: workerTargets,
    asOf: new Date().toISOString(),
  });
}
