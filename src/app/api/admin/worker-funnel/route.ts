import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";
import { getWorkerFunnel } from "@/lib/worker-funnel";

/**
 * Worker acquisition funnel for the admin Worker funnel page. Counts only;
 * no worker is identified, and nothing here is shown to venues or workers.
 * Reads straight from the database on every request.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(await getWorkerFunnel());
}
