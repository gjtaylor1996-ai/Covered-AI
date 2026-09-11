"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

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
    <div className="page">
      <AppHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/admin/verification", label: "Verification" },
          { href: "/admin/disputes", label: "Disputes" },
        ]}
      />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "18px" }}>Ops dashboard</h1>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        {stats && (
          <>
            {(stats.openDisputeCount > 0 || stats.verificationBacklog > 0 || stats.fillRate !== null) && (
              <div className="insights-card">
                <div className="section-title" style={{ marginTop: 0 }}>Needs attention</div>
                {stats.openDisputeCount > 0 && (
                  <div className="insight-row">
                    <span className="insight-icon">⚠</span>
                    <span>
                      <Link href="/admin/disputes">
                        {stats.openDisputeCount} dispute{stats.openDisputeCount === 1 ? "" : "s"} awaiting review
                      </Link>
                      .
                    </span>
                  </div>
                )}
                {stats.verificationBacklog > 0 && (
                  <div className="insight-row">
                    <span className="insight-icon">⚠</span>
                    <span>
                      <Link href="/admin/verification">
                        {stats.verificationBacklog} worker{stats.verificationBacklog === 1 ? "" : "s"} waiting on verification
                      </Link>
                      .
                    </span>
                  </div>
                )}
                {stats.openDisputeCount === 0 && stats.verificationBacklog === 0 && (
                  <div className="insight-row">
                    <span className="insight-icon">✓</span>
                    <span>Nothing needs your attention right now.</span>
                  </div>
                )}
                {stats.fillRate !== null && (
                  <div className="insight-row">
                    <span className="insight-icon">💡</span>
                    <span>{Math.round(stats.fillRate * 100)}% of posted shifts get filled.</span>
                  </div>
                )}
              </div>
            )}

            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-label">Open disputes</div>
                <div
                  className="stat-value"
                  style={{ color: stats.openDisputeCount > 0 ? "var(--red-deep)" : "var(--green)" }}
                >
                  {stats.openDisputeCount}
                </div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Fill rate</div>
                <div
                  className="stat-value"
                  style={stats.fillRate !== null && stats.fillRate < 0.8 ? { color: "var(--amber-deep)" } : undefined}
                >
                  {stats.fillRate === null ? "—" : `${Math.round(stats.fillRate * 100)}%`}
                </div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">GMV</div>
                <div className="stat-value">£{(stats.gmvCents / 100).toFixed(2)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Platform revenue</div>
                <div className="stat-value">£{(stats.platformRevenueCents / 100).toFixed(2)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Verification backlog</div>
                <div
                  className="stat-value"
                  style={{ color: stats.verificationBacklog > 0 ? "var(--amber-deep)" : "var(--green)" }}
                >
                  {stats.verificationBacklog}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="section-title">Account lookup</div>
        <form onSubmit={lookup} className="card" style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Email</label>
            <input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="btn primary" disabled={busy}>Look up</button>
        </form>

        {found && (
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <div className="avatar">{found.email[0]?.toUpperCase()}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "14.5px" }}>{found.email}</div>
                <div className="text-muted" style={{ fontSize: "12px", textTransform: "capitalize" }}>{found.role.replace(/_/g, " ")}</div>
              </div>
              {found.suspendedAt ? (
                <span className="badge rejected" style={{ marginLeft: "auto" }}>suspended: {found.suspendedReason}</span>
              ) : (
                <span className="badge confirmed" style={{ marginLeft: "auto" }}>active</span>
              )}
            </div>
            {!found.suspendedAt ? (
              <>
                <div className="field">
                  <label>Reason (required)</label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <button className="btn primary" disabled={busy} onClick={() => setSuspended(true)}>Suspend</button>
              </>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => setSuspended(false)}>Reactivate</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
