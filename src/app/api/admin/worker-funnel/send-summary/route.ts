import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getAdminUser } from "@/lib/permissions";
import { getWorkerFunnel } from "@/lib/worker-funnel";
import { buildWorkerSummary } from "@/lib/worker-summary";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Sends the weekly worker summary now, to the admin who asked for it (their
 * login email), so the email can be checked without waiting for Monday.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await getAdminUser(session.userId);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isEmailConfigured()) return NextResponse.json({ error: "email_not_configured" }, { status: 409 });

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const summary = buildWorkerSummary(await getWorkerFunnel(), getSiteUrl());
  const result = await sendEmail({ to: [user.email], ...summary });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ sent: true, to: user.email });
}
