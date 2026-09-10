"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";

interface Dispute {
  id: string;
  raisedBy: string;
  targetType: string;
  targetId: string;
  reason: string;
  note: string;
  checkType: string | null;
  evidence: string | null;
  status: string;
  updatedAt: string;
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/admin/disputes?status=pending_review");
    if (!res.ok) {
      setError("Could not load disputes — are you logged in as an admin?");
      return;
    }
    const body = await res.json();
    setDisputes(body.disputes);
  }

  useEffect(() => {
    load();
  }, []);

  async function resolve(dispute: Dispute, status: "resolved_upheld" | "resolved_excluded") {
    const reason = reasons[dispute.id];
    if (!reason?.trim()) {
      setError("Enter a reason before resolving.");
      return;
    }
    setBusyId(dispute.id);
    setError(null);
    const res = await fetch(`/api/admin/disputes/${dispute.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason, expectedUpdatedAt: dispute.updatedAt }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "stale_dispute"
          ? "Someone else just resolved this — reloading."
          : "Could not resolve this dispute."
      );
      await load();
      return;
    }
    await load();
  }

  return (
    <div className="page">
      <AppHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/admin/verification", label: "Verification" },
          { href: "/admin/dashboard", label: "Dashboard" },
        ]}
      />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>Dispute queue</h1>
        <p className="text-muted why-box" style={{ marginTop: 0 }}>
          &quot;Objective&quot; means there&apos;s independent evidence (a Stripe payment
          timestamp) corroborating the shift happened as recorded — still a human decision, just
          with more to go on. Automated triage only ever sets that label; it never resolves a
          dispute itself.
        </p>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        <div className="section-title">Pending</div>

        {disputes === null ? (
          <p className="text-muted">Loading…</p>
        ) : disputes.length === 0 ? (
          <p className="text-muted">Nothing pending.</p>
        ) : (
          disputes.map((d) => (
            <div key={d.id} className="card">
              <p style={{ fontSize: "13.5px" }}>
                Raised by <strong>{d.raisedBy}</strong> against{" "}
                <strong>{d.targetType.replace("_", " ")}</strong>{" "}
                {d.checkType && <span className="badge pending">{d.checkType}</span>}
              </p>
              <p style={{ fontSize: "13px" }}><strong>Reason:</strong> {d.reason}</p>
              <p style={{ fontSize: "13px" }}><strong>Note:</strong> {d.note}</p>
              {d.evidence && (
                <p className="text-success" style={{ fontSize: "13px" }}>
                  <strong>Evidence:</strong> {d.evidence}
                </p>
              )}
              <div className="field">
                <input
                  placeholder="Reason for resolution (required)"
                  value={reasons[d.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [d.id]: e.target.value }))}
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn primary" disabled={busyId === d.id} onClick={() => resolve(d, "resolved_upheld")}>
                  Uphold original record
                </button>
                <button className="btn ghost" disabled={busyId === d.id} onClick={() => resolve(d, "resolved_excluded")}>
                  Exclude from score
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
