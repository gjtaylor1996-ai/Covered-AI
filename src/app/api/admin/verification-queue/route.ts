import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";

/** Items needing manual review — spec §8.2. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const workers = await db.workerProfile.findMany({
    where: {
      OR: [
        { rightToWorkStatus: "pending" },
        { idVerificationStatus: "pending" },
        { dbsStatus: "pending" },
      ],
    },
    select: {
      id: true,
      name: true,
      primaryRole: true,
      rightToWorkStatus: true,
      rightToWorkShareCode: true,
      rightToWorkDob: true,
      rightToWorkSubmittedAt: true,
      idVerificationStatus: true,
      onfidoCheckId: true,
      idVerificationSubmittedAt: true,
      dbsStatus: true,
      dbsApplicationRef: true,
      dbsSubmittedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ workers });
}
