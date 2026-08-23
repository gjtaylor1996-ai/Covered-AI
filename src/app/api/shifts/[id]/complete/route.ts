import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { canPostShifts, getVenueMembership } from "@/lib/permissions";
import { recalculateReliabilityScore } from "@/lib/scoring";

const completeSchema = z.object({
  confirmedAttendance: z.boolean(),
  onTime: z.boolean(),
  minutesLate: z.number().int().nonnegative().nullable().optional(),
});

// Manual "mark complete" — this writes the ShiftFeedback record the
// state machine calls for (§3.1) and triggers a Reliability Score
// recalculation (§6), inline since there's no job queue yet.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership || !canPostShifts(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const shift = await db.shift.findUnique({ where: { id: params.id } });
  if (!shift || shift.venueId !== membership.venueId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (shift.status !== "confirmed") {
    return NextResponse.json(
      { error: "shift_not_confirmed", status: shift.status },
      { status: 409 }
    );
  }

  const { confirmedAttendance, onTime, minutesLate } = parsed.data;

  const [feedback, updatedShift] = await db.$transaction([
    db.shiftFeedback.create({
      data: {
        shiftId: shift.id,
        confirmedAttendance,
        onTime,
        minutesLate: minutesLate ?? null,
      },
    }),
    db.shift.update({
      where: { id: shift.id },
      data: { status: confirmedAttendance ? "completed" : "no_show" },
    }),
    db.workerProfile.update({
      where: { id: shift.workerId! },
      data: confirmedAttendance
        ? { shiftsCompleted: { increment: 1 } }
        : { noShows: { increment: 1 } },
    }),
  ]);

  await recalculateReliabilityScore(shift.workerId!);

  return NextResponse.json({ shift: updatedShift, feedback });
}
