import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";

const schema = z.object({ accept: z.boolean() });

/**
 * Worker accepts/declines — spec §4. On accept, spec §3.3: "removing the
 * worker from that venue's active casual search results... while
 * leaving their Covered profile otherwise intact for other venues" —
 * implemented as a query-time filter in /api/candidates rather than a
 * stored flag, so there's nothing to keep in sync if a hire is ever
 * reversed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "worker") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const worker = await getWorkerProfile(session.userId);
  if (!worker) {
    return NextResponse.json({ error: "no_worker_profile" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const hireRequest = await db.hireRequest.findUnique({ where: { id: params.id } });
  if (!hireRequest || hireRequest.workerId !== worker.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (hireRequest.status !== "pending_worker_response") {
    return NextResponse.json(
      { error: "already_resolved", status: hireRequest.status },
      { status: 409 }
    );
  }

  const updated = await db.hireRequest.update({
    where: { id: hireRequest.id },
    data: {
      status: parsed.data.accept ? "accepted" : "declined",
      respondedAt: new Date(),
    },
  });

  return NextResponse.json({ hireRequest: updated });
}
