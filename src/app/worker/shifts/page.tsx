"use client";

import { useEffect, useState } from "react";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { VerificationPanel } from "../verification-panel";
import { HireRequestsPanel } from "../hire-requests-panel";
import { formatTime12h } from "@/components/TimeInput";
import { AppHeader } from "@/components/AppHeader";

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
  shiftFeedback: { id: string } | null;
}

interface ScoreBreakdown {
  reliabilityScore: number | null;
  reliabilityTier: string;
  plainLanguageSummary: string;
}

export default function WorkerShiftsPage() {
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
  const [disputedFeedback, setDisputedFeedback] = useState<Set<string>>(new Set());

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
    loadShifts();
    loadScore();
    loadPayoutStatus();
  }, []);

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
    setDisputedFeedback((s) => new Set(s).add(feedbackId));
    setDisputingId(null);
    setDisputeReason("");
    setDisputeNote("");
  }

  const statusLabel: Record<string, string> = {
    offered: "pending",
    confirmed: "confirmed",
    completed: "confirmed",
    cancelled: "rejected",
    no_show: "rejected",
  };

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
          <div className="why-box">
            <button className="btn primary" disabled={connecting} onClick={connectPayouts} style={{ marginRight: "10px" }}>
              {connecting ? "Redirecting…" : "Connect payouts"}
            </button>
            you won&apos;t be paid for completed shifts until this is set up.
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
              </div>
              <span className={`badge ${statusLabel[shift.status] ?? "pending"}`}>{shift.status.replace("_", " ")}</span>

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
                  (disputedFeedback.has(shift.shiftFeedback.id) ? (
                    <span className="text-muted" style={{ fontSize: "12px" }}> Dispute submitted</span>
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
                    <button className="btn ghost" onClick={() => setDisputingId(shift.id)}>
                      Dispute this
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
