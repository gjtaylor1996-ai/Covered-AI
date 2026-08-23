import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { canPostShifts, getVenueMembership } from "@/lib/permissions";
import { isWorkerDoubleBooked } from "@/lib/shift-time";

const schema = z.object({
  date: z.string(), // "YYYY-MM-DD"
  startTime: z.string().default("18:00"),
  endTime: z.string().default("23:00"),
});

/**
 * "Book, rebook, and confirm — one tap to rebook someone reliable"
 * (covered-landing.html). Not a separate spec §4 endpoint — it's the
 * favourites feature plus shift-creation plus offer, chained into one
 * request so the prototype's "one tap" claim is actually true rather
 * than three separate screens. Uses the worker's own rate and role
 * rather than asking the venue to re-enter them.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { workerId: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership || !canPostShifts(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const isFavourite = await db.favourite.findUnique({
    where: { venueId_workerId: { venueId: membership.venueId, workerId: params.workerId } },
  });
  const worker = await db.workerProfile.findUnique({ where: { id: params.workerId } });
  if (!isFavourite || !worker) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { date, startTime, endTime } = parsed.data;
  const draft = { date: new Date(date), startTime, endTime };

  if (await isWorkerDoubleBooked(worker.id, draft)) {
    return NextResponse.json({ error: "worker_double_booked" }, { status: 409 });
  }

  const shift = await db.shift.create({
    data: {
      venueId: membership.venueId,
      workerId: worker.id,
      role: worker.primaryRole,
      date: draft.date,
      startTime,
      endTime,
      hourlyRate: worker.hourlyRate,
      status: "offered",
      offeredAt: new Date(),
      respondBy: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({ shift }, { status: 201 });
}
