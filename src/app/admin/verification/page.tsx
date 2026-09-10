"use client";

import { useEffect, useState } from "react";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";

type VerificationField = "rightToWorkStatus" | "idVerificationStatus" | "dbsStatus";

interface QueueWorker {
  id: string;
  name: string;
  primaryRole: WorkerRoleKey;
  rightToWorkStatus: string;
  rightToWorkMethod: string | null;
  rightToWorkShareCode: string | null;
  rightToWorkDob: string | null;
  rightToWorkNationality: string | null;
  rightToWorkPassportNumber: string | null;
  rightToWorkSubmittedAt: string | null;
  idVerificationStatus: string;
  personaInquiryId: string | null;
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
    <div className="page">
      <AppHeader
        links={[
          { href: "/", label: "Home" },
          { href: "/admin/disputes", label: "Disputes" },
          { href: "/admin/dashboard", label: "Dashboard" },
        ]}
      />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>Verification queue</h1>
        <p className="text-muted why-box" style={{ marginTop: 0 }}>
          ID verification resolves automatically via Persona except when it comes back
          anything other than &quot;approved&quot; — right to work and DBS always land here,
          since neither has a self-serve API to check automatically.
        </p>

        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        <div className="field" style={{ margin: "16px 0" }}>
          <label>Reason (required for every decision below)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Checked gov.uk/view-right-to-work, valid until 2028"
          />
        </div>

        {workers === null ? (
          <p className="text-muted">Loading…</p>
        ) : workers.length === 0 ? (
          <p className="text-muted">Nothing pending.</p>
        ) : (
          workers.map((w) => (
            <div key={w.id} className="card">
              <strong>{w.name}</strong>{" "}
              <span className="text-muted" style={{ fontSize: "12.5px" }}>
                {WORKER_ROLE_LABELS[w.primaryRole]}
              </span>

              {w.idVerificationStatus === "pending" && (
                <div style={{ marginTop: "10px" }}>
                  <span className="badge pending">{FIELD_LABELS.idVerificationStatus}</span>
                  {w.personaInquiryId && (
                    <span className="text-muted" style={{ fontSize: "12.5px" }}>
                      {" "}— Persona inquiry {w.personaInquiryId}
                    </span>
                  )}
                  <DecisionButtons
                    busy={busyKey === `${w.id}:idVerificationStatus`}
                    onDecide={(status) => decide(w.id, "idVerificationStatus", status)}
                  />
                </div>
              )}

              {w.rightToWorkStatus === "pending" && (
                <div style={{ marginTop: "10px" }}>
                  <span className="badge pending">{FIELD_LABELS.rightToWorkStatus}</span>
                  {w.rightToWorkMethod === "share_code" && w.rightToWorkShareCode && (
                    <p style={{ fontSize: "12.5px", margin: "6px 0" }}>
                      Share code <strong>{w.rightToWorkShareCode}</strong>, DOB{" "}
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
                    </p>
                  )}
                  {w.rightToWorkMethod === "manual_document" && (
                    <p style={{ fontSize: "12.5px", margin: "6px 0" }}>
                      <strong>Manual passport check needed</strong>: {w.rightToWorkNationality} citizen,
                      passport <strong>{w.rightToWorkPassportNumber}</strong>, DOB{" "}
                      {w.rightToWorkDob && new Date(w.rightToWorkDob).toLocaleDateString("en-GB")}.
                      British/Irish citizens aren&apos;t issued a share code — arrange to physically
                      inspect this worker&apos;s original passport in person before confirming. A photo
                      or scan is not sufficient evidence for this check.
                    </p>
                  )}
                  <DecisionButtons
                    busy={busyKey === `${w.id}:rightToWorkStatus`}
                    onDecide={(status) => decide(w.id, "rightToWorkStatus", status)}
                  />
                </div>
              )}

              {w.dbsStatus === "pending" && (
                <div style={{ marginTop: "10px" }}>
                  <span className="badge pending">{FIELD_LABELS.dbsStatus}</span>
                  {w.dbsApplicationRef && (
                    <span className="text-muted" style={{ fontSize: "12.5px" }}>
                      {" "}— application ref {w.dbsApplicationRef}
                    </span>
                  )}
                  <DecisionButtons
                    busy={busyKey === `${w.id}:dbsStatus`}
                    onDecide={(status) => decide(w.id, "dbsStatus", status)}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
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
    <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
      <button className="btn primary" disabled={busy} onClick={() => onDecide("verified")}>
        Verify
      </button>
      <button className="btn ghost" disabled={busy} onClick={() => onDecide("rejected")}>
        Reject
      </button>
    </div>
  );
}
