"use client";

import { useEffect, useState } from "react";

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
    <section style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Permanent hire offers</h2>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {pending.map((r) => (
          <li key={r.id} style={{ borderBottom: "1px solid #eee", padding: "0.5rem 0" }}>
            <strong>{r.venue.name}</strong> is offering <strong>{r.proposedRoleTitle}</strong> at
            £{r.proposedSalary.toLocaleString()}/yr, starting{" "}
            {new Date(r.proposedStartDate).toLocaleDateString("en-GB")}.
            <br />
            {r.feeOption === "conversion_fee"
              ? `The venue chose to pay a conversion fee${r.feeAmount ? ` (£${r.feeAmount.toFixed(2)})` : ""} rather than an extended hire period — this doesn't cost you anything.`
              : "The venue chose an extended hire period rather than a conversion fee."}
            <div style={{ marginTop: "0.25rem" }}>
              <button disabled={busyId === r.id} onClick={() => respond(r.id, true)}>
                Accept
              </button>{" "}
              <button disabled={busyId === r.id} onClick={() => respond(r.id, false)}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
