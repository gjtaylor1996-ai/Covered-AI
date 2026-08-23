import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";

/** Not in spec §4/§8.2 explicitly, but the suspend endpoint needs a User id from somewhere, and there's no other account directory yet. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, suspendedAt: true, suspendedReason: true },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ user });
}
