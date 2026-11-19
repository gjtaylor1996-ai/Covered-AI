import { createHash, randomBytes } from "crypto";

/** Reset links stop working after this long. */
export const RESET_TOKEN_TTL_MINUTES = 60;
/** At most one reset email per account in this window, to stop email flooding. */
export const RESET_COOLDOWN_SECONDS = 60;

export function newResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The password reset email. The link is the only thing in it that matters. */
export function buildResetEmail(link: string) {
  const subject = "Reset your Covered password";
  const text = [
    "Someone asked to reset the password for your Covered account.",
    "",
    `Choose a new password here (the link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes):`,
    link,
    "",
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#e7e1ce;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#fbf9f2;border-radius:10px;">
<tr><td style="background:#1f2623;border-radius:10px 10px 0 0;padding:20px 24px;color:#e7e1ce;font-size:20px;font-weight:700;letter-spacing:3px;">COVERED</td></tr>
<tr><td style="padding:24px;color:#3a423e;font-size:15px;line-height:24px;">
<p style="margin:0 0 14px;">Someone asked to reset the password for your Covered account.</p>
<p style="margin:0 0 20px;">Choose a new password with the button below. The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes.</p>
<a href="${link}" style="display:inline-block;background:#e19a33;color:#1f2623;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:6px;font-size:15px;">Reset my password</a>
<p style="margin:20px 0 0;font-size:13px;color:#6b7a79;">Or copy this link into your browser:<br><span style="word-break:break-all;">${link}</span></p>
<p style="margin:18px 0 0;font-size:13px;color:#6b7a79;">If you didn't ask for this, you can ignore this email. Your password won't change.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
