import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { recalculateVenueTrustScore } from "@/lib/venue-trust";

const rateVenueSchema = z.object({
  paidOnTime: z.boolean(),
  breaksGiven: z.boolean(),
  matchedDescription: z.boolean(),
  comment: z.string().max(2000).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = rateVenueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const shift = await db.shift.findUnique({ where: { id: params.id } });
  if (!shift || shift.workerId !== worker.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (shift.status !== "completed") {
    return NextResponse.json(
      { error: "shift_not_completed", status: shift.status },
      { status: 409 }
    );
  }

  const existing = await db.venueFeedback.findUnique({
    where: { shiftId: shift.id },
  });
  if (existing) {
    return NextResponse.json({ error: "already_rated" }, { status: 409 });
  }

  const feedback = await db.venueFeedback.create({
    data: { shiftId: shift.id, ...parsed.data },
  });

  await recalculateVenueTrustScore(shift.venueId);

  return NextResponse.json({ feedback }, { status: 201 });
}
