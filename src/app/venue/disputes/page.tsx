"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";

interface DisputeRow {
  id: string;
  status: string;
  checkType: string | null;
  evidence: string | null;
  reason: string;
  note: string;
  createdAt: string;
  shift: { id: string; role: WorkerRoleKey; date: string; workerName: string | null };
  feedback: { paidOnTime: boolean; breaksGiven: boolean; matchedDescription: boolean; comment: string | null };
}

export default function VenueDisputesPage() {
  const [disputes, setDisputes] = useState<DisputeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/venues/me/disputes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => setDisputes(body.disputes))
      .catch(() => setError("Could not load disputes — are you logged in as a venue?"));
  }, []);

  const pending = disputes?.filter((d) => d.status === "pending_review") ?? [];
  const resolved = disputes?.filter((d) => d.status !== "pending_review") ?? [];

  function disputeCard(d: DisputeRow) {
    return (
      <div key={d.id} className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
          <div style={{ fontSize: "13.5px" }}>
            <Link href={`/venue/shifts/${d.shift.id}`}>
              {WORKER_ROLE_LABELS[d.shift.role]} · {new Date(d.shift.date).toLocaleDateString("en-GB")}
            </Link>
            {d.shift.workerName && (
              <span className="text-muted"> — rated by {d.shift.workerName}</span>
            )}
          </div>
          {d.status === "pending_review" ? (
            <span className={`check-badge ${d.checkType ?? "subjective"}`}>
              {d.checkType === "objective" ? "Fast-track" : "Standard review"}
            </span>
          ) : d.status === "resolved_excluded" ? (
            <span className="resolved-tag excluded">Excluded from trust score</span>
          ) : (
            <span className="resolved-tag stands">Record stands</span>
          )}
        </div>

        <div className="comment-flags" style={{ marginBottom: "10px" }}>
          <span className={`comment-flag ${d.feedback.paidOnTime ? "yes" : "no"}`}>
            {d.feedback.paidOnTime ? "Paid on time" : "Not paid on time"}
          </span>
          <span className={`comment-flag ${d.feedback.breaksGiven ? "yes" : "no"}`}>
            {d.feedback.breaksGiven ? "Breaks given" : "Breaks missed"}
          </span>
          <span className={`comment-flag ${d.feedback.matchedDescription ? "yes" : "no"}`}>
            {d.feedback.matchedDescription ? "As described" : "Didn't match"}
          </span>
        </div>

        <div style={{ marginBottom: "8px" }}>
          <label style={{ marginBottom: "2px" }}>Your reason</label>
          <p style={{ fontSize: "13px", margin: 0 }}>{d.reason}</p>
        </div>
        <div style={{ marginBottom: d.evidence || d.status !== "pending_review" ? "8px" : 0 }}>
          <label style={{ marginBottom: "2px" }}>Your note</label>
          <p style={{ fontSize: "13px", margin: 0 }}>{d.note}</p>
        </div>

        {d.status === "pending_review" ? (
          <>
            {d.evidence && <div className="check-evidence">{d.evidence}</div>}
            <div className="check-turnaround">
              A person still makes the final call on whether it counts against your trust score.
            </div>
          </>
        ) : (
          <p className="text-muted" style={{ fontSize: "12px", margin: 0 }}>
            Resolved {new Date(d.createdAt).toLocaleDateString("en-GB")} by an admin.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <AppHeader
        links={[
          { href: "/venue/shifts", label: "Your shifts" },
          { href: "/venue/analytics", label: "Analytics" },
        ]}
      />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>Disputes</h1>
        <p className="text-muted why-box" style={{ marginTop: 0 }}>
          Disputes you&apos;ve raised about a worker&apos;s rating of your venue. &quot;Fast-track&quot; means
          there&apos;s independent evidence (a Stripe payment timestamp) corroborating what happened — still a
          human decision, just with more to go on.
        </p>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        <div className="section-title" style={{ marginTop: 0 }}>Pending</div>
        {disputes === null ? (
          <p className="text-muted">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="text-muted">Nothing pending.</p>
        ) : (
          pending.map(disputeCard)
        )}

        {resolved.length > 0 && (
          <>
            <div className="section-title">Resolved</div>
            {resolved.map(disputeCard)}
          </>
        )}
      </div>
    </div>
  );
}
