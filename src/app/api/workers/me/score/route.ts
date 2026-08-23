import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { computeReliabilityScore } from "@/lib/scoring";

/** Full factor breakdown, self-view only — spec §4. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  const breakdown = await computeReliabilityScore(worker.id);
  return NextResponse.json({ breakdown });
}
