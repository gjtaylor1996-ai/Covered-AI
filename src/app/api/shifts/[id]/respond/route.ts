import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getWorkerProfile } from "@/lib/permissions";
import { expireIfPastDeadline } from "@/lib/shift-expiry";

const respondSchema = z.object({ accept: z.boolean() });

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
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let shift = await db.shift.findUnique({ where: { id: params.id } });
  if (!shift || shift.workerId !== worker.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  shift = await expireIfPastDeadline(shift);
  if (shift.status !== "offered") {
    return NextResponse.json(
      { error: "shift_not_offered", status: shift.status },
      { status: 409 }
    );
  }

  // "accepted" and "confirmed" are separate states in the spec's state
  // machine (§3.1), but nothing in Phase 1-3 yet distinguishes them —
  // that gap is for Phase 3 payment authorization to fill. Collapsing
  // straight to "confirmed" here rather than inventing an intermediate
  // step the spec doesn't define.
  //
  // On decline, the diagram shows offered -> declined as terminal, but
  // the spec never gives the venue a way to act on a shift stuck in
  // "declined" — no reopen endpoint exists. Treating a decline the same
  // way as an expired offer (drop back to "open" so the venue can offer
  // it to someone else) is the only path that keeps the shift usable;
  // worth revisiting if the product wants "declined" to persist as its
  // own visible state for reporting.
  const updated = await db.shift.update({
    where: { id: shift.id },
    data: parsed.data.accept
      ? { status: "confirmed" }
      : { status: "open", workerId: null, offeredAt: null, respondBy: null },
  });

  return NextResponse.json({ shift: updated });
}
