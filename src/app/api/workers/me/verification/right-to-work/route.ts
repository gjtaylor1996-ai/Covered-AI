import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { isWithinResubmissionCooldown } from "@/lib/verification";

const schema = z.object({
  shareCode: z.string().regex(/^[A-Za-z0-9]{9}$/, "Share code must be 9 characters"),
  dateOfBirth: z.string(),
});

/**
 * No self-serve API exists for the Home Office right-to-work check —
 * the real process is a share code the worker generates at
 * gov.uk/prove-right-to-work, which a human then looks up at
 * gov.uk/view-right-to-work. This just records the code for an admin to
 * action (see /api/admin/verification/[workerId]/override) and leaves
 * rightToWorkStatus at "pending" — never auto-verifies.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  if (
    worker.rightToWorkStatus === "rejected" &&
    isWithinResubmissionCooldown(worker.rightToWorkSubmittedAt)
  ) {
    return NextResponse.json({ error: "resubmission_cooldown" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const worker2 = await db.workerProfile.update({
    where: { id: worker.id },
    data: {
      rightToWorkShareCode: parsed.data.shareCode.toUpperCase(),
      rightToWorkDob: new Date(parsed.data.dateOfBirth),
      rightToWorkStatus: "pending",
      rightToWorkSubmittedAt: new Date(),
    },
  });

  return NextResponse.json({ worker: worker2 });
}
