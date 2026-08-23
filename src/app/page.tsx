import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export default async function HomePage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const user = session
    ? await db.user.findUnique({ where: { id: session.userId } })
    : null;

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Covered</h1>
      <p style={{ color: "#555" }}>Phase 0 — foundations.</p>

      {user ? (
        <div>
          <p>
            Signed in as <strong>{user.email}</strong> ({user.role}).
          </p>
          <p>
            <Link href={user.role === "venue_admin" ? "/venue/shifts" : "/worker/shifts"}>
              Go to {user.role === "venue_admin" ? "venue" : "worker"} dashboard
            </Link>
          </p>
          <LogoutButton />
        </div>
      ) : (
        <p>
          <Link href="/login">Log in</Link> or{" "}
          <Link href="/signup">sign up</Link>.
        </p>
      )}
    </main>
  );
}
