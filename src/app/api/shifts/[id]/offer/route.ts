import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { canPostShifts, getVenueMembership } from "@/lib/permissions";
import { expireIfPastDeadline } from "@/lib/shift-expiry";
import { getShiftWindow, windowsOverlap } from "@/lib/shift-time";

const offerSchema = z.object({ workerId: z.string().uuid() });

const RESPOND_WINDOW_HOURS = 2;

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
  const parsed = offerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let shift = await db.shift.findUnique({ where: { id: params.id } });
  if (!shift || shift.venueId !== membership.venueId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  shift = await expireIfPastDeadline(shift);
  if (shift.status !== "open") {
    return NextResponse.json(
      { error: "shift_not_open", status: shift.status },
      { status: 409 }
    );
  }

  const worker = await db.workerProfile.findUnique({
    where: { id: parsed.data.workerId },
  });
  if (!worker) {
    return NextResponse.json({ error: "worker_not_found" }, { status: 404 });
  }

  // Double-booking guard, spec §8.7: reject an offer that overlaps a
  // shift this worker has already accepted/confirmed elsewhere. This is
  // the application-level check only — spec also calls for a
  // database-level exclusion constraint as a backstop against a race
  // between two concurrent offers; that needs a raw-SQL migration
  // (btree_gist EXCLUDE) not yet added here.
  const thisWindow = getShiftWindow(shift);
  const sameDayShifts = await db.shift.findMany({
    where: {
      workerId: worker.id,
      status: { in: ["accepted", "confirmed"] },
      date: shift.date,
    },
  });
  const conflict = sameDayShifts.some((other) =>
    windowsOverlap(thisWindow, getShiftWindow(other))
  );
  if (conflict) {
    return NextResponse.json({ error: "worker_double_booked" }, { status: 409 });
  }

  const respondBy = new Date(Date.now() + RESPOND_WINDOW_HOURS * 60 * 60 * 1000);
  const updated = await db.shift.update({
    where: { id: shift.id },
    data: {
      workerId: worker.id,
      status: "offered",
      offeredAt: new Date(),
      respondBy,
    },
  });

  return NextResponse.json({ shift: updated });
}
