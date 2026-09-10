"use client";

import { useEffect, useState } from "react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

interface HireRequest {
  id: string;
  proposedRoleTitle: string;
  proposedSalary: number;
  proposedStartDate: string;
  feeOption: string;
  feeAmount: number | null;
  status: string;
  venue: { id: string; name: string };
}

export function HireRequestsPanel() {
  const [requests, setRequests] = useState<HireRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/hire-requests");
    if (res.ok) {
      const body = await res.json();
      setRequests(body.hireRequests);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function respond(id: string, accept: boolean) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/hire-requests/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept }),
    });
    setBusyId(null);
    if (!res.ok) setError("Could not respond to this offer.");
    await load();
  }

  const pending = requests?.filter((r) => r.status === "pending_worker_response") ?? [];
  if (!requests || pending.length === 0) return null;

  return (
    <section className="card-dark">
      <div className="as-title mono" style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--amber)", marginBottom: "10px" }}>
        Permanent hire offers
      </div>
      {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}
      {pending.map((r) => (
        <div key={r.id} style={{ padding: "12px 0", borderBottom: "1px dashed rgba(242,238,225,0.15)", fontSize: "13px", lineHeight: 1.5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <div className="avatar on-dark">{initials(r.venue.name)}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "13.5px", color: "var(--paper-light)" }}>{r.venue.name}</div>
              <div style={{ fontSize: "11.5px", color: "var(--steel-light)" }}>
                Offering <strong>{r.proposedRoleTitle}</strong>
              </div>
            </div>
          </div>
          £{r.proposedSalary.toLocaleString()}/yr, starting{" "}
          {new Date(r.proposedStartDate).toLocaleDateString("en-GB")}.
          <br />
          <span style={{ color: "var(--steel-light)", fontSize: "12px" }}>
            {r.feeOption === "conversion_fee"
              ? `The venue chose to pay a conversion fee${r.feeAmount ? ` (£${r.feeAmount.toFixed(2)})` : ""} rather than an extended hire period — this doesn't cost you anything.`
              : "The venue chose an extended hire period rather than a conversion fee."}
          </span>
          <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
            <button
              className="btn primary"
              disabled={busyId === r.id}
              onClick={() => respond(r.id, true)}
              style={{ borderColor: "var(--paper-light)" }}
            >
              Accept
            </button>
            <button
              className="btn ghost"
              disabled={busyId === r.id}
              onClick={() => respond(r.id, false)}
              style={{ borderColor: "var(--paper-light)", color: "var(--paper-light)" }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
