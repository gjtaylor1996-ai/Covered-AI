import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { canPostShifts, getVenueMembership, getWorkerProfile } from "@/lib/permissions";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

const WORKER_ROLE_KEYS = Object.keys(WORKER_ROLE_LABELS) as [
  WorkerRoleKey,
  ...WorkerRoleKey[],
];

const createShiftSchema = z.object({
  role: z.enum(WORKER_ROLE_KEYS),
  date: z.string(), // "YYYY-MM-DD"
  startTime: z.string(),
  endTime: z.string(),
  hourlyRate: z.number().positive(),
});

/** Venues see their own posted shifts; workers see shifts assigned to them. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (session.role === "venue_admin") {
    const membership = await getVenueMembership(session.userId);
    if (!membership) {
      return NextResponse.json({ error: "no_venue" }, { status: 403 });
    }
    const shifts = await db.shift.findMany({
      where: { venueId: membership.venueId },
      include: {
        worker: { select: { id: true, name: true } },
        venueFeedback: { select: { id: true } },
      },
      orderBy: { date: "asc" },
    });
    return NextResponse.json({ shifts });
  }

  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }
  const shifts = await db.shift.findMany({
    where: { workerId: worker.id },
    include: {
      venue: { select: { id: true, name: true } },
      shiftFeedback: {
        select: { id: true, confirmedAttendance: true, onTime: true, minutesLate: true },
      },
    },
    orderBy: { date: "asc" },
  });

  // Attach each shift's own dispute (if any) — Dispute has no direct FK
  // to ShiftFeedback (it's polymorphic via targetType/targetId), so this
  // is a separate lookup rather than a Prisma include.
  const feedbackIds = shifts.map((s) => s.shiftFeedback?.id).filter((id): id is string => Boolean(id));
  const disputes = feedbackIds.length
    ? await db.dispute.findMany({
        where: { targetType: "shift_feedback", targetId: { in: feedbackIds } },
        select: { targetId: true, status: true, checkType: true, evidence: true },
      })
    : [];
  const disputeByFeedbackId = new Map(disputes.map((d) => [d.targetId, d]));

  const shiftsWithDispute = shifts.map((shift) => ({
    ...shift,
    shiftFeedback: shift.shiftFeedback
      ? { ...shift.shiftFeedback, dispute: disputeByFeedbackId.get(shift.shiftFeedback.id) ?? null }
      : null,
  }));

  return NextResponse.json({ shifts: shiftsWithDispute });
}

/** Venue posts a new open shift. Permission matrix §8.4: owner/manager/staff. */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership || !canPostShifts(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createShiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { role, date, startTime, endTime, hourlyRate } = parsed.data;

  const shift = await db.shift.create({
    data: {
      venueId: membership.venueId,
      role,
      date: new Date(date),
      startTime,
      endTime,
      hourlyRate,
      status: "open",
    },
  });

  return NextResponse.json({ shift }, { status: 201 });
}
