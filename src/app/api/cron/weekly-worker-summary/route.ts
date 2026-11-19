import { NextRequest, NextResponse } from "next/server";
import { getWorkerFunnel } from "@/lib/worker-funnel";
import { buildWorkerSummary } from "@/lib/worker-summary";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Weekly worker summary email, triggered by Vercel Cron (see vercel.json,
 * Mondays 08:00 UTC). Vercel sends `Authorization: Bearer $CRON_SECRET`; the
 * route refuses to run without that secret, so it cannot be triggered by
 * anyone else. Counts only: no worker is named in the email.
 *
 * Needs CRON_SECRET, RESEND_API_KEY and WEEKLY_SUMMARY_TO (comma-separated
 * addresses). If any is missing it does nothing and says why.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isEmailConfigured()) return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  const to = (process.env.WEEKLY_SUMMARY_TO ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  if (to.length === 0) return NextResponse.json({ error: "no_recipients" }, { status: 503 });

  const summary = buildWorkerSummary(await getWorkerFunnel(), getSiteUrl());
  const result = await sendEmail({ to, ...summary });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ sent: true, recipients: to.length });
}
