import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership, getWorkerProfile } from "@/lib/permissions";
import { classifyDispute } from "@/lib/disputes";

const schema = z.object({
  targetType: z.enum(["shift_feedback", "venue_feedback"]),
  targetId: z.string().uuid(),
  reason: z.string().min(1),
  note: z.string().min(1),
});

/**
 * Raise a dispute — spec §4. Permission matrix §8.4: workers dispute
 * ShiftFeedback about their own shift; venues dispute VenueFeedback
 * about their own shift. Runs the automated triage (§3.2) inline, which
 * only ever sets checkType/evidence, never status.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || (session.role !== "worker" && session.role !== "venue_admin")) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { targetType, targetId, reason, note } = parsed.data;

  if (session.role === "worker") {
    if (targetType !== "shift_feedback") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const worker = await getWorkerProfile(session.userId);
    const feedback = await db.shiftFeedback.findUnique({
      where: { id: targetId },
      include: { shift: true },
    });
    if (!worker || !feedback || feedback.shift.workerId !== worker.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  } else {
    if (targetType !== "venue_feedback") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const membership = await getVenueMembership(session.userId);
    const feedback = await db.venueFeedback.findUnique({
      where: { id: targetId },
      include: { shift: true },
    });
    if (!membership || !feedback || feedback.shift.venueId !== membership.venueId) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  const existing = await db.dispute.findFirst({ where: { targetType, targetId } });
  if (existing) {
    return NextResponse.json({ error: "already_disputed" }, { status: 409 });
  }

  const { checkType, evidence } = await classifyDispute(targetType, targetId);

  const dispute = await db.dispute.create({
    data: {
      raisedBy: session.role === "worker" ? "worker" : "venue",
      targetType,
      targetId,
      reason,
      note,
      checkType,
      evidence,
      status: "pending_review",
    },
  });

  return NextResponse.json({ dispute }, { status: 201 });
}
