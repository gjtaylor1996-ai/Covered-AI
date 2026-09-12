import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { LogoutButton } from "./logout-button";
import { HomeMarketingPanel } from "./home-marketing-panel";

function dashboardPath(role: string): string {
  if (role === "venue_admin") return "/venue/shifts";
  if (role === "admin") return "/admin/verification";
  return "/worker/shifts";
}

const ROLE_LABEL: Record<string, string> = {
  worker: "Worker account",
  venue_admin: "Venue account",
  admin: "Admin account",
};

export default async function HomePage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const user = session
    ? await db.user.findUnique({ where: { id: session.userId } })
    : null;

  if (!user) {
    return <HomeMarketingPanel />;
  }

  return (
    <div className="auth-shell">
      <div className="card-dark" style={{ maxWidth: "380px", width: "100%", textAlign: "center", padding: "32px 28px", marginBottom: 0 }}>
        <div className="brand-mark" style={{ margin: "0 auto 16px" }}>Co</div>
        <h1 style={{ fontSize: "22px", margin: "0 0 6px", color: "var(--paper-light)" }}>Welcome back</h1>
        <p style={{ fontSize: "13px", color: "var(--steel-light)", margin: "0 0 26px", lineHeight: 1.5 }}>
          Signed in as <strong style={{ color: "var(--paper-light)" }}>{user.email}</strong>
          <br />
          {ROLE_LABEL[user.role] ?? user.role}
        </p>
        <Link
          href={dashboardPath(user.role)}
          className="btn primary"
          style={{ width: "100%", display: "block", textAlign: "center", marginBottom: "10px", borderColor: "var(--paper-light)" }}
        >
          Go to dashboard
        </Link>
        <LogoutButton style={{ width: "100%", borderColor: "var(--paper-light)", color: "var(--paper-light)" }} />
      </div>
    </div>
  );
}
