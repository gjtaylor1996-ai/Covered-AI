import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { canPostShifts, getVenueMembership } from "@/lib/permissions";
import { expireIfPastDeadline } from "@/lib/shift-expiry";
import { isWorkerDoubleBooked } from "@/lib/shift-time";
import { computeShiftAmounts } from "@/lib/payments";
import { getBusinessRules } from "@/config/business-rules";
import { sendPushToWorker } from "@/lib/push";
import { isFullyVerified } from "@/lib/verification";
import { WORKER_ROLE_LABELS } from "@/lib/types";

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

  // Search already hides unverified workers; this stops an offer reaching
  // one by id (spec §8.6).
  if (!isFullyVerified(worker)) {
    return NextResponse.json({ error: "worker_not_verified" }, { status: 422 });
  }

  // Double-booking guard, spec §8.7: reject an offer that overlaps a
  // shift this worker has already accepted/confirmed elsewhere. This is
  // the application-level check only — spec also calls for a
  // database-level exclusion constraint as a backstop against a race
  // between two concurrent offers; that needs a raw-SQL migration
  // (btree_gist EXCLUDE) not yet added here.
  if (await isWorkerDoubleBooked(worker.id, shift)) {
    return NextResponse.json({ error: "worker_double_booked" }, { status: 409 });
  }

  // Cold-start safety net: an unproven worker can't be offered a shift
  // worth more than the configured cap, protecting the venue's exposure
  // to a new worker's first few shifts. See business-rules.ts.
  const rules = getBusinessRules();
  if (worker.shiftsCompleted < rules.minShiftsForScore) {
    const { workerAmountCents } = computeShiftAmounts(shift);
    if (workerAmountCents > rules.newWorkerMaxShiftValueCents) {
      return NextResponse.json(
        {
          error: "exceeds_new_worker_cap",
          shiftValueCents: workerAmountCents,
          maxShiftValueCents: rules.newWorkerMaxShiftValueCents,
        },
        { status: 422 }
      );
    }
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

  // Best-effort: the worker still has the offer waiting for them in the
  // app either way, and a missing VAPID config (push not set up yet)
  // shouldn't turn into a 500 on the offer itself.
  sendPushToWorker(worker.id, {
    title: "New shift offer",
    body: `${WORKER_ROLE_LABELS[shift.role]} · £${shift.hourlyRate}/hr · respond within ${RESPOND_WINDOW_HOURS}h`,
    url: "/worker/shifts",
  }).catch(() => {});

  return NextResponse.json({ shift: updated });
}
