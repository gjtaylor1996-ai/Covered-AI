import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";

/** Marks the onboarding wizard done — every step but basics is skippable. */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  if (!worker.onboardingCompletedAt) {
    await db.workerProfile.update({
      where: { id: worker.id },
      data: { onboardingCompletedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
