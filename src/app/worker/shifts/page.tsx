"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { VerificationPanel } from "../verification-panel";

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

  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/">&larr; Home</Link>
      </p>
      <h1>Your shifts</h1>

      <VerificationPanel />

      {score && (
        <div style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "1.5rem" }}>
          <strong>
            Reliability: {score.reliabilityScore ?? "—"} ({score.reliabilityTier})
          </strong>
          <p style={{ margin: "0.25rem 0 0", color: "#555" }}>{score.plainLanguageSummary}</p>
        </div>
      )}

      {payoutsConnected === false && (
        <p>
          <button disabled={connecting} onClick={connectPayouts}>
            {connecting ? "Redirecting…" : "Connect payouts"}
          </button>{" "}
          — you won&apos;t be paid for completed shifts until this is set up.
        </p>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {shifts === null ? (
        <p>Loading…</p>
      ) : shifts.length === 0 ? (
        <p>No shifts yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {shifts.map((shift) => (
            <li
              key={shift.id}
              style={{ borderBottom: "1px solid #eee", padding: "0.75rem 0" }}
            >
              <div>
                <strong>{WORKER_ROLE_LABELS[shift.role]}</strong> at{" "}
                {shift.venue.name} —{" "}
                {new Date(shift.date).toLocaleDateString("en-GB")},{" "}
                {shift.startTime}–{shift.endTime}, £{shift.hourlyRate}/hr
              </div>
              <div>
                Status: {shift.status}
                {shift.status === "offered" && (
                  <>
                    {" "}
                    <button
                      disabled={busyId === shift.id}
                      onClick={() => respond(shift.id, true)}
                    >
                      Accept
                    </button>{" "}
                    <button
                      disabled={busyId === shift.id}
                      onClick={() => respond(shift.id, false)}
                    >
                      Decline
                    </button>
                  </>
                )}
                {shift.status === "confirmed" && (
                  <>
                    {" "}
                    <button
                      disabled={busyId === shift.id}
                      onClick={() => cancelShift(shift.id)}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {shift.status === "completed" &&
                  (ratingId === shift.id ? (
                    <>
                      {" "}
                      <button
                        disabled={busyId === shift.id}
                        onClick={() => rateVenue(shift.id, true)}
                      >
                        Good experience
                      </button>{" "}
                      <button
                        disabled={busyId === shift.id}
                        onClick={() => rateVenue(shift.id, false)}
                      >
                        Had issues
                      </button>
                    </>
                  ) : (
                    <>
                      {" "}
                      <button onClick={() => setRatingId(shift.id)}>
                        Rate this venue
                      </button>
                    </>
                  ))}
                {shift.shiftFeedback &&
                  ["completed", "no_show"].includes(shift.status) &&
                  (disputedFeedback.has(shift.shiftFeedback.id) ? (
                    <span style={{ color: "#555" }}> — dispute submitted</span>
                  ) : disputingId === shift.id ? (
                    <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.5rem" }}>
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
                      <div>
                        <button
                          disabled={busyId === shift.id}
                          onClick={() => submitDispute(shift.shiftFeedback!.id)}
                        >
                          Submit dispute
                        </button>{" "}
                        <button onClick={() => setDisputingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {" "}
                      <button onClick={() => setDisputingId(shift.id)}>
                        Dispute this
                      </button>
                    </>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
