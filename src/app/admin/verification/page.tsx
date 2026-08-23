"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

type VerificationField = "rightToWorkStatus" | "idVerificationStatus" | "dbsStatus";

interface QueueWorker {
  id: string;
  name: string;
  primaryRole: WorkerRoleKey;
  rightToWorkStatus: string;
  rightToWorkShareCode: string | null;
  rightToWorkDob: string | null;
  rightToWorkSubmittedAt: string | null;
  idVerificationStatus: string;
  onfidoCheckId: string | null;
  idVerificationSubmittedAt: string | null;
  dbsStatus: string;
  dbsApplicationRef: string | null;
  dbsSubmittedAt: string | null;
}

const FIELD_LABELS: Record<VerificationField, string> = {
  rightToWorkStatus: "Right to work",
  idVerificationStatus: "ID verification",
  dbsStatus: "DBS check",
};

export default function AdminVerificationPage() {
  const [workers, setWorkers] = useState<QueueWorker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    const res = await fetch("/api/admin/verification-queue");
    if (!res.ok) {
      setError("Could not load the queue — are you logged in as an admin?");
      return;
    }
    const body = await res.json();
    setWorkers(body.workers);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(workerId: string, field: VerificationField, status: "verified" | "rejected") {
    if (!reason.trim()) {
      setError("Enter a reason before deciding.");
      return;
    }
    const key = `${workerId}:${field}`;
    setBusyKey(key);
    setError(null);
    const res = await fetch(`/api/admin/verification/${workerId}/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, status, reason }),
    });
    setBusyKey(null);
    if (!res.ok) {
      setError("Could not record that decision.");
      return;
    }
    setReason("");
    await load();
  }

  return (
    <main style={{ maxWidth: 800, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/">&larr; Home</Link> · <Link href="/admin/disputes">Disputes</Link> ·{" "}
        <Link href="/admin/dashboard">Dashboard</Link>
      </p>
      <h1>Verification queue</h1>
      <p style={{ color: "#555" }}>
        ID verification resolves automatically via Onfido except when it comes back
        &quot;consider&quot; — right to work and DBS always land here, since neither has a
        self-serve API to check automatically.
      </p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <label style={{ display: "block", margin: "1rem 0" }}>
        Reason (required for every decision below)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Checked gov.uk/view-right-to-work, valid until 2028"
          style={{ display: "block", width: "100%" }}
        />
      </label>

      {workers === null ? (
        <p>Loading…</p>
      ) : workers.length === 0 ? (
        <p>Nothing pending.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {workers.map((w) => (
            <li key={w.id} style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "1rem" }}>
              <strong>{w.name}</strong> — {WORKER_ROLE_LABELS[w.primaryRole]}

              {w.idVerificationStatus === "pending" && (
                <div style={{ marginTop: "0.5rem" }}>
                  {FIELD_LABELS.idVerificationStatus}: pending
                  {w.onfidoCheckId && <> — Onfido check {w.onfidoCheckId}</>}
                  <DecisionButtons
                    busy={busyKey === `${w.id}:idVerificationStatus`}
                    onDecide={(status) => decide(w.id, "idVerificationStatus", status)}
                  />
                </div>
              )}

              {w.rightToWorkStatus === "pending" && (
                <div style={{ marginTop: "0.5rem" }}>
                  {FIELD_LABELS.rightToWorkStatus}: pending
                  {w.rightToWorkShareCode && (
                    <>
                      {" "}
                      — share code <strong>{w.rightToWorkShareCode}</strong>, DOB{" "}
                      {w.rightToWorkDob && new Date(w.rightToWorkDob).toLocaleDateString("en-GB")}.
                      Check at{" "}
                      <a
                        href="https://www.gov.uk/view-right-to-work"
                        target="_blank"
                        rel="noreferrer"
                      >
                        gov.uk/view-right-to-work
                      </a>
                      .
                    </>
                  )}
                  <DecisionButtons
                    busy={busyKey === `${w.id}:rightToWorkStatus`}
                    onDecide={(status) => decide(w.id, "rightToWorkStatus", status)}
                  />
                </div>
              )}

              {w.dbsStatus === "pending" && (
                <div style={{ marginTop: "0.5rem" }}>
                  {FIELD_LABELS.dbsStatus}: pending
                  {w.dbsApplicationRef && <> — application ref {w.dbsApplicationRef}</>}
                  <DecisionButtons
                    busy={busyKey === `${w.id}:dbsStatus`}
                    onDecide={(status) => decide(w.id, "dbsStatus", status)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function DecisionButtons({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (status: "verified" | "rejected") => void;
}) {
  return (
    <>
      {" "}
      <button disabled={busy} onClick={() => onDecide("verified")}>
        Verify
      </button>{" "}
      <button disabled={busy} onClick={() => onDecide("rejected")}>
        Reject
      </button>
    </>
  );
}
