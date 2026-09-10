import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

function dashboardPath(role: string): string {
  if (role === "venue_admin") return "/venue/shifts";
  if (role === "admin") return "/admin/verification";
  return "/worker/shifts";
}

export default async function HomePage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const user = session
    ? await db.user.findUnique({ where: { id: session.userId } })
    : null;

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="brand-mark" style={{ margin: "0 auto 14px" }}>Co</div>
        <h1 style={{ fontSize: "26px" }}>Covered</h1>
        <p className="text-muted" style={{ fontSize: "12.5px", margin: "6px 0 20px" }}>
          Phase 4 — verification.
        </p>

        {user ? (
          <div>
            <p style={{ fontSize: "13.5px" }}>
              Signed in as <strong>{user.email}</strong> ({user.role}).
            </p>
            <Link href={dashboardPath(user.role)} className="btn primary" style={{ display: "inline-block", margin: "10px 0" }}>
              Go to dashboard
            </Link>
            <div>
              <LogoutButton />
            </div>
          </div>
        ) : (
          <p style={{ fontSize: "13.5px" }}>
            <Link href="/login" className="btn primary" style={{ marginRight: "8px" }}>Log in</Link>
            <Link href="/signup" className="btn ghost">Sign up</Link>
          </p>
        )}
      </div>
    </div>
  );
}
