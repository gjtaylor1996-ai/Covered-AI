import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { computeReliabilityScore } from "@/lib/scoring";

/**
 * Public-facing profile as venues see it — spec §4 and §7 data
 * minimisation: score, tier, and a plain-language summary only. Never
 * the raw shift log, never which other venues this worker has worked
 * for. Enforced here at the API layer, not left to the frontend.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const worker = await db.workerProfile.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      primaryRole: true,
      yearsExperience: true,
      hourlyRate: true,
      postcode: true,
      cv: { select: { id: true } },
    },
  });
  if (!worker) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const breakdown = await computeReliabilityScore(worker.id);
  const { cv, ...rest } = worker;

  return NextResponse.json({
    worker: {
      ...rest,
      hasCv: cv !== null,
      reliabilityScore: breakdown.reliabilityScore,
      reliabilityTier: breakdown.reliabilityTier,
      summary: breakdown.plainLanguageSummary,
    },
  });
}
