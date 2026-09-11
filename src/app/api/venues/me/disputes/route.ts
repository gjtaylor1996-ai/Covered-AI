import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership } from "@/lib/permissions";

/**
 * All disputes raised on this venue's own VenueFeedback records, across
 * every shift — the venue-side equivalent of /admin/disputes, read-only
 * (only an admin can resolve a dispute, per the human-in-the-loop
 * constraint). Dispute has no direct FK to VenueFeedback (polymorphic via
 * targetType/targetId), so this joins manually like GET /api/shifts/[id].
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "venue_admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const membership = await getVenueMembership(session.userId);
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const feedbackRows = await db.venueFeedback.findMany({
    where: { shift: { venueId: membership.venueId } },
    select: {
      id: true,
      paidOnTime: true,
      breaksGiven: true,
      matchedDescription: true,
      comment: true,
      shift: {
        select: { id: true, role: true, date: true, worker: { select: { name: true } } },
      },
    },
  });

  const disputes = await db.dispute.findMany({
    where: { targetType: "venue_feedback", targetId: { in: feedbackRows.map((f) => f.id) } },
    orderBy: { createdAt: "desc" },
  });

  const feedbackById = new Map(feedbackRows.map((f) => [f.id, f]));
  const rows = disputes.map((d) => {
    const feedback = feedbackById.get(d.targetId)!;
    return {
      id: d.id,
      status: d.status,
      checkType: d.checkType,
      evidence: d.evidence,
      reason: d.reason,
      note: d.note,
      createdAt: d.createdAt,
      shift: {
        id: feedback.shift.id,
        role: feedback.shift.role,
        date: feedback.shift.date,
        workerName: feedback.shift.worker?.name ?? null,
      },
      feedback: {
        paidOnTime: feedback.paidOnTime,
        breaksGiven: feedback.breaksGiven,
        matchedDescription: feedback.matchedDescription,
        comment: feedback.comment,
      },
    };
  });

  return NextResponse.json({ disputes: rows });
}
