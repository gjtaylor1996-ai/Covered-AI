import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";
import type { DisputeCheckType, DisputeStatus } from "@prisma/client";

/** Filterable queue by checkType and status — spec §8.2. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as DisputeStatus | null;
  const checkType = searchParams.get("checkType") as DisputeCheckType | null;

  const disputes = await db.dispute.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(checkType ? { checkType } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ disputes });
}
