import type { WorkerFunnel } from "@/lib/worker-funnel";

const MILESTONES = ["before the first venue goes live", "by the end of week 4", "by the end of week 8"];

function next(value: number, targets: number[]): { target: number; milestone: string } | null {
  const i = targets.findIndex((t) => value < t);
  const target = targets[i];
  const milestone = MILESTONES[i];
  return i === -1 || target === undefined || milestone === undefined ? null : { target, milestone };
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");

/** The weekly worker summary: counts only, no worker is named. */
export function buildWorkerSummary(f: WorkerFunnel, baseUrl: string) {
  const s = f.steps;
  const thisWeek = f.weeks[f.weeks.length - 1]?.signedUp ?? 0;
  const lastWeek = f.weeks[f.weeks.length - 2]?.signedUp ?? 0;
  const diff = thisWeek - lastWeek;
  const trend = diff === 0 ? "the same as last week" : `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than last week`;

  const nextSignup = next(s.signedUp, f.targets.signedUp);
  const nextApproved = next(s.approved, f.targets.approved);
  const targetLines = [
    nextSignup ? `Signed up: ${s.signedUp} of ${nextSignup.target} ${nextSignup.milestone}` : "Signed up: every target reached",
    nextApproved ? `Approved: ${s.approved} of ${nextApproved.target} ${nextApproved.milestone}` : "Approved: every target reached",
  ];

  const stepRows: [string, number][] = [
    ["Signed up", s.signedUp],
    ["Finished onboarding", s.onboarded],
    ["Started their checks", s.startedChecks],
    ["Approved (appear in venue search)", s.approved],
    ["Had a shift offered", s.gotOffer],
    ["Completed a shift", s.completedShift],
  ];
  const sources = f.sources.slice(0, 5);
  const link = `${baseUrl.replace(/\/$/, "")}/admin/worker-funnel`;

  const subject = `Covered workers: ${thisWeek} new this week, ${s.signedUp} in total`;

  const text = [
    `Covered worker summary`,
    ``,
    `New signups in the last 7 days: ${thisWeek} (${trend}).`,
    ``,
    `Progress against the plan`,
    ...targetLines.map((l) => `- ${l}`),
    ``,
    `The funnel`,
    ...stepRows.map(([label, n]) => `- ${label}: ${n} (${pct(n, s.signedUp)} of signed up)`),
    ``,
    `Where workers came from`,
    ...(sources.length ? sources.map((x) => `- ${x.label}: ${x.signedUp} signed up, ${x.approved} approved`) : ["- No signups yet"]),
    ``,
    `Full page: ${link}`,
  ].join("\n");

  const td = "padding:6px 10px;border-bottom:1px solid #e0dac6;font-size:14px;color:#3a423e;";
  const html = `<!doctype html><html><body style="margin:0;background:#e7e1ce;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#fbf9f2;border-radius:10px;">
<tr><td style="background:#1f2623;border-radius:10px 10px 0 0;padding:20px 24px;color:#e7e1ce;font-size:20px;font-weight:700;letter-spacing:3px;">COVERED <span style="font-size:12px;letter-spacing:1px;color:#b9c2bf;font-weight:400;">&nbsp;worker summary</span></td></tr>
<tr><td style="padding:22px 24px 6px 24px;color:#1f2623;font-size:16px;line-height:24px;"><strong style="font-size:30px;">${thisWeek}</strong> new worker signup${thisWeek === 1 ? "" : "s"} in the last 7 days<br><span style="color:#6b7a79;font-size:14px;">${trend.charAt(0).toUpperCase() + trend.slice(1)}. ${s.signedUp} in total, ${s.approved} approved.</span></td></tr>
<tr><td style="padding:14px 24px 0 24px;"><div style="font-size:12px;letter-spacing:2px;color:#9a5f12;font-weight:700;">PROGRESS AGAINST THE PLAN</div>
${targetLines.map((l) => `<div style="font-size:14px;color:#3a423e;padding:4px 0;">${l}</div>`).join("")}</td></tr>
<tr><td style="padding:16px 24px 0 24px;"><div style="font-size:12px;letter-spacing:2px;color:#9a5f12;font-weight:700;padding-bottom:4px;">THE FUNNEL</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepRows
    .map(([label, n]) => `<tr><td style="${td}">${label}</td><td style="${td}text-align:right;"><strong>${n}</strong> <span style="color:#6b7a79;">(${pct(n, s.signedUp)})</span></td></tr>`)
    .join("")}</table></td></tr>
<tr><td style="padding:16px 24px 0 24px;"><div style="font-size:12px;letter-spacing:2px;color:#9a5f12;font-weight:700;padding-bottom:4px;">WHERE WORKERS CAME FROM</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${
    sources.length
      ? sources.map((x) => `<tr><td style="${td}">${x.label}</td><td style="${td}text-align:right;">${x.signedUp} signed up, ${x.approved} approved</td></tr>`).join("")
      : `<tr><td style="${td}">No signups yet</td></tr>`
  }</table></td></tr>
<tr><td style="padding:20px 24px 24px 24px;"><a href="${link}" style="display:inline-block;background:#e19a33;color:#1f2623;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:6px;font-size:15px;">Open the Worker funnel</a>
<div style="font-size:12px;color:#6b7a79;padding-top:14px;">Counts only. No worker is named in this email.</div></td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
