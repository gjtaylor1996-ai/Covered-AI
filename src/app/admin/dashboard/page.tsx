"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardStats {
  openDisputeCount: number;
  fillRate: number | null;
  gmvCents: number;
  platformRevenueCents: number;
  verificationBacklog: number;
}

interface LookedUpUser {
  id: string;
  email: string;
  role: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [found, setFound] = useState<LookedUpUser | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadStats() {
    const res = await fetch("/api/admin/dashboard");
    if (!res.ok) {
      setError("Could not load stats — are you logged in as an admin?");
      return;
    }
    setStats(await res.json());
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFound(null);
    const res = await fetch(`/api/admin/accounts/lookup?email=${encodeURIComponent(email)}`);
    setBusy(false);
    if (!res.ok) {
      setError("No account found with that email.");
      return;
    }
    const body = await res.json();
    setFound(body.user);
  }

  async function setSuspended(suspend: boolean) {
    if (!found) return;
    if (suspend && !reason.trim()) {
      setError("Enter a reason before suspending.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/accounts/${found.id}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspend, reason: reason || "Reactivated" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not update this account — ops_manager role or higher is required to suspend.");
      return;
    }
    const body = await res.json();
    setFound((f) =>
      f ? { ...f, suspendedAt: body.user.suspendedAt, suspendedReason: body.user.suspendedReason } : f
    );
    setReason("");
  }

  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/">&larr; Home</Link> · <Link href="/admin/verification">Verification queue</Link>{" "}
        · <Link href="/admin/disputes">Disputes</Link>
      </p>
      <h1>Ops dashboard</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {stats && (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
          <li>Open disputes: <strong>{stats.openDisputeCount}</strong></li>
          <li>
            Fill rate:{" "}
            <strong>{stats.fillRate === null ? "—" : `${Math.round(stats.fillRate * 100)}%`}</strong>
          </li>
          <li>GMV: <strong>£{(stats.gmvCents / 100).toFixed(2)}</strong></li>
          <li>Platform revenue (commission): <strong>£{(stats.platformRevenueCents / 100).toFixed(2)}</strong></li>
          <li>Pending verification backlog: <strong>{stats.verificationBacklog}</strong></li>
        </ul>
      )}

      <hr style={{ margin: "1.5rem 0" }} />

      <h2>Account lookup</h2>
      <form onSubmit={lookup} style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={busy}>Look up</button>
      </form>

      {found && (
        <div style={{ marginTop: "1rem" }}>
          <p>
            {found.email} ({found.role}) —{" "}
            {found.suspendedAt ? (
              <strong style={{ color: "crimson" }}>suspended: {found.suspendedReason}</strong>
            ) : (
              <strong style={{ color: "#276" }}>active</strong>
            )}
          </p>
          {!found.suspendedAt ? (
            <>
              <input
                placeholder="Reason (required)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: "100%", marginBottom: "0.5rem" }}
              />
              <button disabled={busy} onClick={() => setSuspended(true)}>Suspend</button>
            </>
          ) : (
            <button disabled={busy} onClick={() => setSuspended(false)}>Reactivate</button>
          )}
        </div>
      )}
    </main>
  );
}
