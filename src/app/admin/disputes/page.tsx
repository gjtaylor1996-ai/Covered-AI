"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
    <main style={{ maxWidth: 800, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/">&larr; Home</Link> · <Link href="/admin/verification">Verification queue</Link>{" "}
        · <Link href="/admin/dashboard">Dashboard</Link>
      </p>
      <h1>Dispute queue</h1>
      <p style={{ color: "#555" }}>
        &quot;Objective&quot; means there&apos;s independent evidence (a Stripe payment
        timestamp) corroborating the shift happened as recorded — still a human decision, just
        with more to go on. Automated triage only ever sets that label; it never resolves a
        dispute itself.
      </p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {disputes === null ? (
        <p>Loading…</p>
      ) : disputes.length === 0 ? (
        <p>Nothing pending.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {disputes.map((d) => (
            <li key={d.id} style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "1rem" }}>
              <p>
                Raised by <strong>{d.raisedBy}</strong> against{" "}
                <strong>{d.targetType.replace("_", " ")}</strong> —{" "}
                <span style={{ textTransform: "uppercase", fontSize: "0.8em" }}>{d.checkType}</span>
              </p>
              <p><strong>Reason:</strong> {d.reason}</p>
              <p><strong>Note:</strong> {d.note}</p>
              {d.evidence && <p style={{ color: "#276" }}><strong>Evidence:</strong> {d.evidence}</p>}
              <input
                placeholder="Reason for resolution (required)"
                value={reasons[d.id] ?? ""}
                onChange={(e) => setReasons((r) => ({ ...r, [d.id]: e.target.value }))}
                style={{ width: "100%", marginBottom: "0.5rem" }}
              />
              <button disabled={busyId === d.id} onClick={() => resolve(d, "resolved_upheld")}>
                Uphold original record
              </button>{" "}
              <button disabled={busyId === d.id} onClick={() => resolve(d, "resolved_excluded")}>
                Exclude from score
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
