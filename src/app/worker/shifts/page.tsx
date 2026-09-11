"use client";

import { useEffect, useState } from "react";
import { WORKER_ROLE_LABELS, type WeeklyAvailability, type WorkerRoleKey } from "@/lib/types";
import { VerificationPanel } from "../verification-panel";
import { HireRequestsPanel } from "../hire-requests-panel";
import { OnboardingWizard } from "../onboarding-wizard";
import { formatTime12h } from "@/components/TimeInput";
import { AppHeader } from "@/components/AppHeader";

interface WorkerSummary {
  primaryRole: WorkerRoleKey;
  postcode: string;
  yearsExperience: number;
  hourlyRate: number;
  maxTravelDistanceMi: number;
  availability: WeeklyAvailability;
  dbsStatus: string;
  bankAccountConnected: boolean;
  onboardingCompletedAt: string | null;
}

interface ShiftListItem {
  id: string;
  role: WorkerRoleKey;
  date: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  status: string;
  respondBy: string | null;
  venue: { id: string; name: string };
  shiftFeedback: {
    id: string;
    confirmedAttendance: boolean;
    onTime: boolean;
    minutesLate: number | null;
    dispute: { status: string; checkType: string | null; evidence: string | null } | null;
  } | null;
  payment: { status: string; workerAmountCents: number; failureReason: string | null } | null;
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

interface ScoreBreakdown {
  reliabilityScore: number | null;
  reliabilityTier: string;
  plainLanguageSummary: string;
}

export default function WorkerShiftsPage() {
  const [worker, setWorker] = useState<WorkerSummary | null>(null);
  const [shifts, setShifts] = useState<ShiftListItem[] | null>(null);
  const [score, setScore] = useState<ScoreBreakdown | null>(null);
  const [payoutsConnected, setPayoutsConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ratingId, setRatingId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disputingId, setDisputingId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeNote, setDisputeNote] = useState("");

  async function loadWorker() {
    const res = await fetch("/api/workers/me");
    if (res.ok) {
      const body = await res.json();
      setWorker(body.worker);
    }
  }

  async function loadShifts() {
    const res = await fetch("/api/shifts");
    if (!res.ok) {
      setError("Could not load your shifts — are you logged in as a worker?");
      return;
    }
    const body = await res.json();
    setShifts(body.shifts);
  }

  async function loadScore() {
    const res = await fetch("/api/workers/me/score");
    if (res.ok) {
      const body = await res.json();
      setScore(body.breakdown);
    }
  }

  async function loadPayoutStatus() {
    const res = await fetch("/api/me");
    if (res.ok) {
      const body = await res.json();
      setPayoutsConnected(Boolean(body.user.workerProfile?.bankAccountConnected));
    }
  }

  useEffect(() => {
    loadWorker();
    loadShifts();
    loadScore();
    loadPayoutStatus();
  }, []);

  async function handleOnboardingComplete() {
    await Promise.all([loadWorker(), loadShifts(), loadScore(), loadPayoutStatus()]);
  }

  async function connectPayouts() {
    setConnecting(true);
    setError(null);
    const res = await fetch("/api/workers/me/stripe/connect", { method: "POST" });
    setConnecting(false);
    if (!res.ok) {
      setError("Could not start payout setup.");
      return;
    }
    const body = await res.json();
    window.location.href = body.url;
  }

  async function cancelShift(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/shifts/${id}/cancel`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      setError("Could not cancel this shift.");
    }
    await loadShifts();
  }

  async function respond(id: string, accept: boolean) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/shifts/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError("Could not respond to this offer — it may have expired.");
    }
    await loadShifts();
  }

  async function rateVenue(id: string, good: boolean) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/shifts/${id}/rate-venue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paidOnTime: good,
        breaksGiven: good,
        matchedDescription: good,
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "already_rated"
          ? "You've already rated this shift."
          : "Could not submit your rating."
      );
    } else {
      setRatingId(null);
    }
  }

  async function submitDispute(feedbackId: string) {
    if (!disputeReason.trim() || !disputeNote.trim()) {
      setError("Fill in both the reason and a note before submitting.");
      return;
    }
    setBusyId(disputingId);
    setError(null);
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "shift_feedback",
        targetId: feedbackId,
        reason: disputeReason,
        note: disputeNote,
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "already_disputed"
          ? "This has already been disputed."
          : "Could not submit the dispute."
      );
      return;
    }
    setDisputingId(null);
    setDisputeReason("");
    setDisputeNote("");
    await loadShifts();
  }

  const statusLabel: Record<string, string> = {
    offered: "pending",
    confirmed: "confirmed",
    completed: "confirmed",
    cancelled: "rejected",
    no_show: "rejected",
  };

  if (worker === null) {
    return null;
  }

  if (!worker.onboardingCompletedAt) {
    return <OnboardingWizard worker={worker} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="page">
      <AppHeader links={[{ href: "/", label: "Home" }]} />

      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "18px" }}>Your shifts</h1>

        <HireRequestsPanel />

        <VerificationPanel />

        {score && (
          <div className="card-dark score-hero">
            <div className="score-stamp">
              <div className="num">{score.reliabilityScore ?? "—"}</div>
              <div className="tag">{score.reliabilityTier}</div>
            </div>
            <div className="score-copy">
              <div className="lbl">Reliability score</div>
              <p>{score.plainLanguageSummary}</p>
            </div>
          </div>
        )}

        {payoutsConnected === false && (
          <div className="connect-nudge">
            <div className="connect-nudge-icon">🏦</div>
            <div className="connect-nudge-copy">
              <div className="title">Connect payouts</div>
              <p>You won&apos;t be paid for completed shifts until a bank account is linked via Stripe.</p>
            </div>
            <button className="btn primary" disabled={connecting} onClick={connectPayouts}>
              {connecting ? "Redirecting…" : "Connect payouts"}
            </button>
          </div>
        )}

        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        <div className="section-title">Shifts</div>

        {shifts === null ? (
          <p className="text-muted">Loading…</p>
        ) : shifts.length === 0 ? (
          <p className="text-muted">No shifts yet.</p>
        ) : (
          shifts.map((shift) => (
            <div key={shift.id} className="card">
              <div className="shift-top">
                <div>
                  <div className="shift-role">{WORKER_ROLE_LABELS[shift.role]}</div>
                  <div className="shift-venue">{shift.venue.name}</div>
                </div>
                <div className="shift-pay">£{shift.hourlyRate}/hr</div>
              </div>
              <div className="shift-meta">
                <span>📅 {new Date(shift.date).toLocaleDateString("en-GB")}</span>
                <span>🕔 {formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}</span>
                {shift.status === "completed" && shift.shiftFeedback && (
                  <span style={{ color: shift.shiftFeedback.onTime ? "var(--green)" : "var(--amber-deep)" }}>
                    {shift.shiftFeedback.onTime ? "✓ On time" : `◐ ${shift.shiftFeedback.minutesLate ?? 0} min late`}
                  </span>
                )}
                {shift.status === "no_show" && (
                  <span style={{ color: "var(--red-deep)" }}>✕ No-show recorded</span>
                )}
              </div>
              <span className={`badge ${statusLabel[shift.status] ?? "pending"}`}>{shift.status.replace("_", " ")}</span>
              {shift.status === "completed" && shift.payment && (
                <span
                  className={`badge ${PAYMENT_BADGE[shift.payment.status] ?? "pending"}`}
                  style={{ marginLeft: "8px" }}
                >
                  {PAYMENT_LABEL[shift.payment.status] ?? shift.payment.status}
                  {shift.payment.status === "paid_out" && ` · £${(shift.payment.workerAmountCents / 100).toFixed(2)}`}
                </span>
              )}
              {shift.status === "completed" && shift.payment?.status === "failed" && shift.payment.failureReason && (
                <div className="text-error" style={{ fontSize: "11.5px", marginTop: "6px" }}>
                  {shift.payment.failureReason}
                </div>
              )}

              <div style={{ marginTop: "10px" }}>
                {shift.status === "offered" && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn primary" disabled={busyId === shift.id} onClick={() => respond(shift.id, true)}>
                      Accept
                    </button>
                    <button className="btn ghost" disabled={busyId === shift.id} onClick={() => respond(shift.id, false)}>
                      Decline
                    </button>
                  </div>
                )}
                {shift.status === "confirmed" && (
                  <button className="btn ghost" disabled={busyId === shift.id} onClick={() => cancelShift(shift.id)}>
                    Cancel
                  </button>
                )}
                {shift.status === "completed" &&
                  (ratingId === shift.id ? (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="btn primary" disabled={busyId === shift.id} onClick={() => rateVenue(shift.id, true)}>
                        Good experience
                      </button>
                      <button className="btn ghost" disabled={busyId === shift.id} onClick={() => rateVenue(shift.id, false)}>
                        Had issues
                      </button>
                    </div>
                  ) : (
                    <button className="btn ghost" onClick={() => setRatingId(shift.id)}>
                      Rate this venue
                    </button>
                  ))}
                {shift.shiftFeedback &&
                  ["completed", "no_show"].includes(shift.status) &&
                  (shift.shiftFeedback.dispute ? (
                    shift.shiftFeedback.dispute.status === "pending_review" ? (
                      <div style={{ marginTop: "8px" }}>
                        <span className={`check-badge ${shift.shiftFeedback.dispute.checkType ?? "subjective"}`}>
                          {shift.shiftFeedback.dispute.checkType === "objective" ? "Fast-track" : "Standard review"}
                        </span>
                        {shift.shiftFeedback.dispute.evidence && (
                          <div className="check-evidence">{shift.shiftFeedback.dispute.evidence}</div>
                        )}
                        <div className="check-turnaround">
                          A person still makes the final call on whether it counts against you — excluded from
                          your score until then.
                        </div>
                      </div>
                    ) : shift.shiftFeedback.dispute.status === "resolved_excluded" ? (
                      <span className="resolved-tag excluded" style={{ marginTop: "8px" }}>
                        Resolved — excluded from your score
                      </span>
                    ) : (
                      <span className="resolved-tag stands" style={{ marginTop: "8px" }}>
                        Resolved — record stands, included in your score
                      </span>
                    )
                  ) : disputingId === shift.id ? (
                    <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                      <input
                        placeholder="Reason (e.g. I was on time, this is wrong)"
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                      />
                      <textarea
                        placeholder="Note — give the details a reviewer would need"
                        value={disputeNote}
                        onChange={(e) => setDisputeNote(e.target.value)}
                      />
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button className="btn primary" disabled={busyId === shift.id} onClick={() => submitDispute(shift.shiftFeedback!.id)}>
                          Submit dispute
                        </button>
                        <button className="btn ghost" onClick={() => setDisputingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="dispute-link" style={{ marginTop: "8px" }} onClick={() => setDisputingId(shift.id)}>
                      Dispute this record
                    </button>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
