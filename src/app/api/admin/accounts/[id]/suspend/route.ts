import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser, writeAuditLog } from "@/lib/permissions";

const schema = z.object({
  reason: z.string().min(1),
  suspend: z.boolean().default(true), // false = reactivate
});

/**
 * Suspend a worker or venue account, with a required reason, logged —
 * spec §8.2. :id is the User id (an "account" is a login, and a venue
 * account may back several VenueMember rows across venues). Reversible
 * via {suspend:false} since the spec doesn't otherwise describe a way
 * to undo an accidental suspension.
 *
 * Known gap: this blocks new logins and search visibility, but an
 * already-active session isn't revoked (sessions are stateless JWTs —
 * revoking mid-session would need a server-side session store or a
 * suspension check on every request, neither of which exists yet).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Suspending an account is a heavier action than a verification
  // override — restrict to ops_manager+ per the permission matrix §8.4.
  if (admin.role === "reviewer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updated = await db.user.update({
    where: { id: target.id },
    data: parsed.data.suspend
      ? { suspendedAt: new Date(), suspendedReason: parsed.data.reason }
      : { suspendedAt: null, suspendedReason: null },
  });

  await writeAuditLog({
    adminId: admin.id,
    action: parsed.data.suspend ? "account.suspend" : "account.reactivate",
    targetType: "User",
    targetId: target.id,
    reason: parsed.data.reason,
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      suspendedAt: updated.suspendedAt,
      suspendedReason: updated.suspendedReason,
    },
  });
}
