import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership, getWorkerProfile } from "@/lib/permissions";
import { expireIfPastDeadline } from "@/lib/shift-expiry";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let shift = await db.shift.findUnique({ where: { id: params.id } });
  if (!shift) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  shift = await expireIfPastDeadline(shift);

  if (session.role === "venue_admin") {
    const membership = await getVenueMembership(session.userId);
    if (!membership || membership.venueId !== shift.venueId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    const worker = await getWorkerProfile(session.userId);
    if (!worker || shift.workerId !== worker.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const full = await db.shift.findUnique({
    where: { id: shift.id },
    include: {
      venue: { select: { id: true, name: true } },
      worker: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ shift: full });
}
