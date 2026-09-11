"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { formatTime12h } from "@/components/TimeInput";
import { AppHeader } from "@/components/AppHeader";

interface PaymentInfo {
  status: string;
  workerAmountCents: number;
  commissionAmountCents: number;
  totalAmountCents: number;
  failureReason: string | null;
  venueChargeFailed: boolean;
  venueChargeFailureReason: string | null;
}

const PAYMENT_BADGE: Record<string, string> = {
  pending_setup: "pending",
  charging: "pending",
  charged: "pending",
  paid_out: "confirmed",
  failed: "rejected",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending_setup: "payout pending",
  charging: "processing",
  charged: "processing",
  paid_out: "paid out",
  failed: "payout failed",
};

interface ShiftDetail {
  id: string;
  role: WorkerRoleKey;
  date: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  status: string;
  respondBy: string | null;
  worker: { id: string; name: string } | null;
  payment: PaymentInfo | null;
  venueFeedback: {
    id: string;
    paidOnTime: boolean;
    breaksGiven: boolean;
    matchedDescription: boolean;
    comment: string | null;
    dispute: { status: string; checkType: string | null; evidence: string | null } | null;
  } | null;
}

interface Candidate {
  id: string;
  name: string;
  primaryRole: WorkerRoleKey;
  yearsExperience: number;
  hourlyRate: number;
  reliabilityScore: number | null;
  reliabilityTier: string;
  shiftsCompleted: number;
  isFavourite: boolean;
  matchScore: number;
  isNewWorker: boolean;
  hasCv: boolean;
}

// Quick actions from the prototype (covered.html, applyQuickAction) —
// preset search filters, not a separate feature.
const QUICK_ACTIONS: { key: string; label: string; params: Record<string, string> }[] = [
  { key: "tonight", label: "⚡ Need someone tonight", params: { minReliability: "85", sort: "match" } },
  { key: "weekend", label: "🗓 Weekend cover", params: { availability: "weekend", sort: "match" } },
  { key: "kitchen", label: "🍳 Kitchen roles", params: { role: "__kitchen__", sort: "match" } },
];

export default function VenueShiftDetailPage() {
  const params = useParams<{ id: string }>();
  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirmedAttendance, setConfirmedAttendance] = useState(true);
  const [onTime, setOnTime] = useState(true);
  const [minutesLate, setMinutesLate] = useState("0");
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeNote, setDisputeNote] = useState("");
  const [quickAction, setQuickAction] = useState<string | null>(null);

  async function loadShift() {
    const res = await fetch(`/api/shifts/${params.id}`);
    if (!res.ok) {
      setError("Could not load this shift.");
      return;
    }
    const body = await res.json();
    setShift(body.shift);
  }

  useEffect(() => {
    loadShift();
  }, [params.id]);

  useEffect(() => {
    if (shift?.status !== "open") return;
    const action = QUICK_ACTIONS.find((a) => a.key === quickAction);
    const params = new URLSearchParams({ role: shift.role, ...action?.params });
    // A quick action's own role filter (e.g. kitchen roles) overrides
    // this shift's specific role — matches the prototype, where quick
    // actions replace the role filter rather than combine with it.
    if (action?.params.role) params.set("role", action.params.role);
    fetch(`/api/candidates?${params}`)
      .then((res) => res.json())
      .then((body) => setCandidates(body.candidates))
      .catch(() => setError("Could not load candidates."));
  }, [shift?.status, shift?.role, quickAction]);

  async function toggleFavourite(workerId: string) {
    await fetch(`/api/venues/me/favourites/${workerId}`, { method: "POST" });
    setCandidates((cs) =>
      cs ? cs.map((c) => (c.id === workerId ? { ...c, isFavourite: !c.isFavourite } : c)) : cs
    );
  }

  async function handleOffer(workerId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/shifts/${params.id}/offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "worker_double_booked"
          ? "That worker already has an overlapping shift."
          : body.error === "exceeds_new_worker_cap"
            ? `This shift pays more than the £${(body.maxShiftValueCents / 100).toFixed(2)} cap for a worker with no track record yet.`
            : "Could not send the offer."
      );
      return;
    }
    await loadShift();
  }

  async function handleCancel() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/shifts/${params.id}/cancel`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not cancel this shift.");
      return;
    }
    await loadShift();
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/shifts/${params.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmedAttendance,
        onTime,
        minutesLate: onTime ? 0 : Number.parseInt(minutesLate, 10) || 0,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not mark this shift complete.");
      return;
    }
    await loadShift();
  }

  async function handleRetryCharge() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/shifts/${params.id}/charge`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not retry payment.");
      return;
    }
    await loadShift();
  }

  async function submitDispute() {
    if (!shift?.venueFeedback || !disputeReason.trim() || !disputeNote.trim()) {
      setError("Fill in both the reason and a note before submitting.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "venue_feedback",
        targetId: shift.venueFeedback.id,
        reason: disputeReason,
        note: disputeNote,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "already_disputed"
          ? "This has already been disputed."
          : "Could not submit the dispute."
      );
      return;
    }
    setDisputing(false);
    setDisputeReason("");
    setDisputeNote("");
    await loadShift();
  }

  if (error && !shift) {
    return (
      <div className="page">
        <AppHeader
          links={[
            { href: "/venue/shifts", label: "All shifts" },
            { href: "/venue/disputes", label: "Disputes" },
          ]}
        />
        <div className="content">
          <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>
        </div>
      </div>
    );
  }
  if (!shift) {
    return (
      <div className="page">
        <AppHeader
          links={[
            { href: "/venue/shifts", label: "All shifts" },
            { href: "/venue/disputes", label: "Disputes" },
          ]}
        />
        <div className="content">
          <p className="text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <AppHeader
        links={[
          { href: "/venue/shifts", label: "All shifts" },
          { href: "/venue/disputes", label: "Disputes" },
        ]}
      />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "6px" }}>{WORKER_ROLE_LABELS[shift.role]}</h1>
        <p className="text-muted" style={{ fontSize: "13px", margin: "0 0 10px" }}>
          {new Date(shift.date).toLocaleDateString("en-GB")}, {formatTime12h(shift.startTime)}–
          {formatTime12h(shift.endTime)} · £{shift.hourlyRate}/hr
        </p>
        <span className={`badge ${shift.status === "confirmed" || shift.status === "completed" ? "confirmed" : shift.status === "offered" ? "pending" : "rejected"}`}>
          {shift.status.replace(/_/g, " ")}
        </span>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        {shift.status === "open" && (
          <section style={{ marginTop: "20px" }}>
            <div className="section-title" style={{ marginTop: 0 }}>Offer to a candidate</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.key}
                  className={`chip ${quickAction === a.key ? "active" : ""}`}
                  onClick={() => setQuickAction(quickAction === a.key ? null : a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {candidates === null ? (
              <p className="text-muted">Loading candidates…</p>
            ) : candidates.length === 0 ? (
              <p className="text-muted">No candidates found.</p>
            ) : (
              candidates.map((c) => (
                <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                  <div style={{ fontSize: "13px", lineHeight: 1.5 }}>
                    <button
                      onClick={() => toggleFavourite(c.id)}
                      title="Favourite"
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--amber-deep)", padding: 0, marginRight: "6px" }}
                    >
                      {c.isFavourite ? "★" : "☆"}
                    </button>
                    <strong>{c.name}</strong> — match {c.matchScore}, {c.yearsExperience}y exp,{" "}
                    {c.reliabilityScore !== null
                      ? `${c.reliabilityScore} (${c.reliabilityTier})`
                      : c.reliabilityTier}
                    , {c.shiftsCompleted} shifts completed
                    {c.isNewWorker && (
                      <span className="text-error" style={{ marginLeft: "6px", fontSize: "12px" }}>
                        · New — capped shift value
                      </span>
                    )}
                    {c.hasCv && (
                      <>
                        {" "}
                        <a href={`/api/workers/${c.id}/cv`} target="_blank" rel="noreferrer">
                          View CV
                        </a>
                      </>
                    )}
                  </div>
                  <button className="btn primary" disabled={busy} onClick={() => handleOffer(c.id)}>
                    Offer
                  </button>
                </div>
              ))
            )}
          </section>
        )}

        {shift.status === "offered" && (
          <p style={{ marginTop: "16px", fontSize: "13.5px" }}>
            Offered to <strong>{shift.worker?.name}</strong>, awaiting response
            {shift.respondBy &&
              ` by ${new Date(shift.respondBy).toLocaleTimeString("en-GB")}`}
            .
          </p>
        )}

        {shift.status === "confirmed" && (
          <section style={{ marginTop: "16px" }}>
            <p style={{ fontSize: "13.5px" }}>
              Confirmed with <strong>{shift.worker?.name}</strong>.{" "}
              <button className="btn ghost" disabled={busy} onClick={handleCancel}>
                Cancel shift
              </button>
            </p>
            <div className="section-title">Mark complete</div>
            <form onSubmit={handleComplete} className="card">
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "13.5px", textTransform: "none", letterSpacing: "normal", color: "var(--ink)" }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={confirmedAttendance}
                  onChange={(e) => setConfirmedAttendance(e.target.checked)}
                />
                Showed up and completed the shift
              </label>
              {confirmedAttendance && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "13.5px", textTransform: "none", letterSpacing: "normal", color: "var(--ink)" }}>
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={onTime}
                      onChange={(e) => setOnTime(e.target.checked)}
                    />
                    On time
                  </label>
                  {!onTime && (
                    <div className="field" style={{ maxWidth: "160px", marginTop: "10px" }}>
                      <label>Minutes late</label>
                      <input
                        type="number"
                        min="0"
                        value={minutesLate}
                        onChange={(e) => setMinutesLate(e.target.value)}
                      />
                    </div>
                  )}
                </>
              )}
              <button type="submit" className="btn primary" disabled={busy} style={{ marginTop: "12px" }}>
                Submit
              </button>
            </form>
          </section>
        )}

        {["completed", "no_show", "cancelled_by_worker", "cancelled_by_venue"].includes(
          shift.status
        ) && <p className="text-muted" style={{ marginTop: "16px" }}>This shift is closed ({shift.status.replace(/_/g, " ")}).</p>}

        {shift.status === "completed" && shift.payment && (
          <section style={{ marginTop: "16px" }}>
            <div className="section-title" style={{ marginTop: 0 }}>Payment</div>
            <div className="card">
              <p style={{ fontSize: "13.5px", marginBottom: "10px" }}>
                Worker payout:{" "}
                <span className={`badge ${PAYMENT_BADGE[shift.payment.status] ?? "pending"}`}>
                  {PAYMENT_LABEL[shift.payment.status] ?? shift.payment.status.replace(/_/g, " ")}
                </span>
              </p>
              <div className="stat-grid" style={{ marginBottom: shift.payment.failureReason ? "10px" : 0 }}>
                <div className="stat-tile">
                  <div className="stat-label">Total</div>
                  <div className="stat-value">£{(shift.payment.totalAmountCents / 100).toFixed(2)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">To worker</div>
                  <div className="stat-value">£{(shift.payment.workerAmountCents / 100).toFixed(2)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Commission</div>
                  <div className="stat-value">£{(shift.payment.commissionAmountCents / 100).toFixed(2)}</div>
                </div>
              </div>
              {shift.payment.failureReason && (
                <p className="text-error" style={{ fontSize: "12.5px" }}>{shift.payment.failureReason}</p>
              )}
              <p style={{ fontSize: "13.5px", marginTop: "10px" }}>
                Your card charge:{" "}
                <span className={`badge ${shift.payment.venueChargeFailed ? "rejected" : "confirmed"}`}>
                  {shift.payment.venueChargeFailed ? "failed" : "succeeded"}
                </span>
              </p>
              {shift.payment.venueChargeFailed && (
                <p className="text-error" style={{ fontSize: "12.5px" }}>
                  {shift.payment.venueChargeFailureReason}
                  {shift.payment.status === "paid_out" &&
                    " The worker has already been paid for this shift regardless — this only affects your card."}
                </p>
              )}
              {(shift.payment.status === "pending_setup" ||
                shift.payment.status === "failed" ||
                shift.payment.venueChargeFailed) && (
                <button className="btn primary" disabled={busy} onClick={handleRetryCharge}>
                  Retry payment
                </button>
              )}
            </div>
          </section>
        )}

        {shift.status === "completed" && shift.venueFeedback && (
          <section style={{ marginTop: "16px" }}>
            <div className="section-title" style={{ marginTop: 0 }}>Worker&apos;s rating of you</div>
            <div className="card">
              <div className="comment-flags" style={{ marginBottom: shift.venueFeedback.comment ? "5px" : 0 }}>
                <span className={`comment-flag ${shift.venueFeedback.paidOnTime ? "yes" : "no"}`}>
                  {shift.venueFeedback.paidOnTime ? "Paid on time" : "Not paid on time"}
                </span>
                <span className={`comment-flag ${shift.venueFeedback.breaksGiven ? "yes" : "no"}`}>
                  {shift.venueFeedback.breaksGiven ? "Breaks given" : "Breaks missed"}
                </span>
                <span className={`comment-flag ${shift.venueFeedback.matchedDescription ? "yes" : "no"}`}>
                  {shift.venueFeedback.matchedDescription ? "As described" : "Didn't match"}
                </span>
              </div>
              {shift.venueFeedback.comment && (
                <p className="comment-text" style={{ marginBottom: "10px" }}>{shift.venueFeedback.comment}</p>
              )}

              {shift.venueFeedback.dispute ? (
                shift.venueFeedback.dispute.status === "pending_review" ? (
                  <div>
                    <span className={`check-badge ${shift.venueFeedback.dispute.checkType ?? "subjective"}`}>
                      {shift.venueFeedback.dispute.checkType === "objective" ? "Fast-track" : "Standard review"}
                    </span>
                    {shift.venueFeedback.dispute.evidence && (
                      <div className="check-evidence">{shift.venueFeedback.dispute.evidence}</div>
                    )}
                    <div className="check-turnaround">
                      A person still makes the final call on whether it counts against your trust score.
                    </div>
                  </div>
                ) : shift.venueFeedback.dispute.status === "resolved_excluded" ? (
                  <span className="resolved-tag excluded">Resolved — excluded from your trust score</span>
                ) : (
                  <span className="resolved-tag stands">Resolved — record stands, included in your trust score</span>
                )
              ) : disputing ? (
                <div>
                  <div className="field">
                    <input
                      placeholder="Reason (e.g. this doesn't match what happened)"
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <textarea
                      placeholder="Note — give the details a reviewer would need"
                      value={disputeNote}
                      onChange={(e) => setDisputeNote(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn primary" disabled={busy} onClick={submitDispute}>Submit dispute</button>
                    <button className="btn ghost" onClick={() => setDisputing(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="dispute-link" onClick={() => setDisputing(true)}>Dispute this record</button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
