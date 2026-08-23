import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser, writeAuditLog } from "@/lib/permissions";

const schema = z.object({
  field: z.enum(["rightToWorkStatus", "idVerificationStatus", "dbsStatus"]),
  status: z.enum(["verified", "rejected"]),
  reason: z.string().min(1),
});

/** Manual override, logged with admin user id and reason — spec §8.2. */
export async function POST(
  request: NextRequest,
  { params }: { params: { workerId: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const worker = await db.workerProfile.findUnique({ where: { id: params.workerId } });
  if (!worker) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { field, status, reason } = parsed.data;
  const updated = await db.workerProfile.update({
    where: { id: worker.id },
    data: { [field]: status },
  });

  await writeAuditLog({
    adminId: admin.id,
    action: "verification.override",
    targetType: "WorkerProfile",
    targetId: worker.id,
    reason,
    metadata: { field, status },
  });

  return NextResponse.json({ worker: updated });
}
