// The public address of the site, used for links in emails (password reset,
// weekly summary). Set PUBLIC_SITE_URL when the site moves to its own domain.
// Deliberately NOT taken from the incoming request's Host header: a forged
// header could otherwise point an emailed reset link at an attacker's site.
export function getSiteUrl(): string {
  return (process.env.PUBLIC_SITE_URL || "https://covered-hospitality.vercel.app").replace(/\/$/, "");
}
