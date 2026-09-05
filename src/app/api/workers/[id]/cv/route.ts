import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getVenueMembership, getWorkerProfile } from "@/lib/permissions";

/**
 * Downloads a worker's CV. Unlike the shift log or raw feedback, a CV is
 * something a worker chose to share for exactly this purpose, so any
 * authenticated venue can view it, same visibility as yearsExperience —
 * not gated to a specific shift or search result.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (session.role === "worker") {
    const own = await getWorkerProfile(session.userId);
    if (!own || own.id !== params.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (session.role === "venue_admin") {
    const membership = await getVenueMembership(session.userId);
    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cv = await db.workerCv.findUnique({ where: { workerId: params.id } });
  if (!cv) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(cv.data), {
    headers: {
      "Content-Type": cv.mimeType,
      "Content-Disposition": `inline; filename="${cv.fileName}"`,
    },
  });
}
