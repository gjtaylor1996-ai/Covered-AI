import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";

const schema = z.object({
  applicationRef: z.string().min(1),
});

/**
 * DBS checks require a registered umbrella-body relationship — no
 * self-serve API. This records the worker's DBS application reference
 * (from their own gov.uk application or the umbrella body's portal) for
 * an admin to confirm against that portal; see
 * /api/admin/verification/[workerId]/override.
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
  if (worker.dbsStatus === "not_required") {
    return NextResponse.json({ error: "dbs_not_required_for_role" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const updated = await db.workerProfile.update({
    where: { id: worker.id },
    data: {
      dbsApplicationRef: parsed.data.applicationRef,
      dbsSubmittedAt: new Date(),
      dbsStatus: "pending",
    },
  });

  return NextResponse.json({ worker: updated });
}
