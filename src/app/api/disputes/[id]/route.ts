import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser, getVenueMembership, getWorkerProfile } from "@/lib/permissions";

/** Detail incl. checkType and evidence — spec §4. Visible to the raiser and admins only. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const dispute = await db.dispute.findUnique({ where: { id: params.id } });
  if (!dispute) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (session.role === "admin") {
    const admin = await getAdminUser(session.userId);
    if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ dispute });
  }

  const isRaiser =
    (dispute.raisedBy === "worker" &&
      session.role === "worker" &&
      (await isWorkersDispute(session.userId, dispute.targetType, dispute.targetId))) ||
    (dispute.raisedBy === "venue" &&
      session.role === "venue_admin" &&
      (await isVenuesDispute(session.userId, dispute.targetType, dispute.targetId)));

  if (!isRaiser) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ dispute });
}

async function isWorkersDispute(userId: string, targetType: string, targetId: string) {
  if (targetType !== "shift_feedback") return false;
  const worker = await getWorkerProfile(userId);
  const feedback = await db.shiftFeedback.findUnique({
    where: { id: targetId },
    include: { shift: true },
  });
  return Boolean(worker && feedback && feedback.shift.workerId === worker.id);
}

async function isVenuesDispute(userId: string, targetType: string, targetId: string) {
  if (targetType !== "venue_feedback") return false;
  const membership = await getVenueMembership(userId);
  const feedback = await db.venueFeedback.findUnique({
    where: { id: targetId },
    include: { shift: true },
  });
  return Boolean(membership && feedback && feedback.shift.venueId === membership.venueId);
}
