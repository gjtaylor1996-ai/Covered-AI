// Minimal transactional email sender over the Resend HTTP API (no extra
// dependency). Configure with:
//   RESEND_API_KEY   from https://resend.com/api-keys
//   EMAIL_FROM       e.g. "Covered <hello@yourdomain.co.uk>". Until a domain is
//                    verified in Resend, leave it unset: the sender then defaults
//                    to Resend's test address, which can only email the Resend
//                    account owner's own address.
// Never log the key or message bodies.

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "email_not_configured" };
  const from = process.env.EMAIL_FROM || "Covered <onboarding@resend.dev>";
  try {
    // RESEND_API_BASE is a test-only override so a local mock server can stand in.
    const res = await fetch(`${process.env.RESEND_API_BASE || "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html, text: params.text }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: typeof body.message === "string" ? body.message : `send_failed_${res.status}` };
  } catch {
    return { ok: false, error: "send_failed_network" };
  }
}
