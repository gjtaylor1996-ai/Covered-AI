"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

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
}

interface ScoreBreakdown {
  reliabilityScore: number | null;
  reliabilityTier: string;
  plainLanguageSummary: string;
}

export default function WorkerShiftsPage() {
  const [shifts, setShifts] = useState<ShiftListItem[] | null>(null);
  const [score, setScore] = useState<ScoreBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ratingId, setRatingId] = useState<string | null>(null);

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

  useEffect(() => {
    loadShifts();
    loadScore();
  }, []);

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

  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/">&larr; Home</Link>
      </p>
      <h1>Your shifts</h1>

      {score && (
        <div style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "1.5rem" }}>
          <strong>
            Reliability: {score.reliabilityScore ?? "—"} ({score.reliabilityTier})
          </strong>
          <p style={{ margin: "0.25rem 0 0", color: "#555" }}>{score.plainLanguageSummary}</p>
        </div>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
