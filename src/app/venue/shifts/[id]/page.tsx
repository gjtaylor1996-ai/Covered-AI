"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { formatTime12h } from "@/components/TimeInput";

interface PaymentInfo {
  status: string;
  workerAmountCents: number;
  commissionAmountCents: number;
  totalAmountCents: number;
  failureReason: string | null;
  venueChargeFailed: boolean;
  venueChargeFailureReason: string | null;
}

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
  venueFeedback: { id: string } | null;
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
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);
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
    setDisputeSubmitted(true);
    setDisputing(false);
  }

  if (error && !shift) {
    return (
      <main style={{ maxWidth: 560, margin: "3rem auto" }}>
        <p style={{ color: "crimson" }}>{error}</p>
      </main>
    );
  }
  if (!shift) {
    return (
      <main style={{ maxWidth: 560, margin: "3rem auto" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/venue/shifts">&larr; All shifts</Link>
      </p>
      <h1>{WORKER_ROLE_LABELS[shift.role]}</h1>
      <p>
        {new Date(shift.date).toLocaleDateString("en-GB")}, {formatTime12h(shift.startTime)}–
        {formatTime12h(shift.endTime)} · £{shift.hourlyRate}/hr
      </p>
      <p>
        Status: <strong>{shift.status}</strong>
      </p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {shift.status === "open" && (
        <section>
          <h2>Offer to a candidate</h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => setQuickAction(quickAction === a.key ? null : a.key)}
                style={{
                  border: quickAction === a.key ? "2px solid #333" : "1px solid #ccc",
                  borderRadius: 20,
                  padding: "0.4rem 0.8rem",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
          {candidates === null ? (
            <p>Loading candidates…</p>
          ) : candidates.length === 0 ? (
            <p>No candidates found.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {candidates.map((c) => (
                <li
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    borderBottom: "1px solid #eee",
                    padding: "0.5rem 0",
                  }}
                >
                  <span>
                    <button
                      onClick={() => toggleFavourite(c.id)}
                      title="Favourite"
                      style={{ border: "none", background: "none", cursor: "pointer" }}
                    >
                      {c.isFavourite ? "★" : "☆"}
                    </button>{" "}
                    {c.name} — match {c.matchScore}, {c.yearsExperience}y exp,{" "}
                    {c.reliabilityScore !== null
                      ? `${c.reliabilityScore} (${c.reliabilityTier})`
                      : c.reliabilityTier}
                    , {c.shiftsCompleted} shifts completed
                    {c.isNewWorker && (
                      <span style={{ color: "#a55", marginLeft: "0.4rem" }}>
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
                  </span>
                  <button disabled={busy} onClick={() => handleOffer(c.id)}>
                    Offer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {shift.status === "offered" && (
        <p>
          Offered to <strong>{shift.worker?.name}</strong>, awaiting response
          {shift.respondBy &&
            ` by ${new Date(shift.respondBy).toLocaleTimeString("en-GB")}`}
          .
        </p>
      )}

      {shift.status === "confirmed" && (
        <section>
          <p>
            Confirmed with <strong>{shift.worker?.name}</strong>.{" "}
            <button disabled={busy} onClick={handleCancel}>
              Cancel shift
            </button>
          </p>
          <h2>Mark complete</h2>
          <form onSubmit={handleComplete} style={{ display: "grid", gap: "0.5rem" }}>
            <label>
              <input
                type="checkbox"
                checked={confirmedAttendance}
                onChange={(e) => setConfirmedAttendance(e.target.checked)}
              />{" "}
              Showed up and completed the shift
            </label>
            {confirmedAttendance && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={onTime}
                    onChange={(e) => setOnTime(e.target.checked)}
                  />{" "}
                  On time
                </label>
                {!onTime && (
                  <label>
                    Minutes late
                    <input
                      type="number"
                      min="0"
                      value={minutesLate}
                      onChange={(e) => setMinutesLate(e.target.value)}
                      style={{ display: "block", width: 120 }}
                    />
                  </label>
                )}
              </>
            )}
            <button type="submit" disabled={busy}>
              Submit
            </button>
          </form>
        </section>
      )}

      {["completed", "no_show", "cancelled_by_worker", "cancelled_by_venue"].includes(
        shift.status
      ) && <p>This shift is closed ({shift.status}).</p>}

      {shift.status === "completed" && shift.payment && (
        <section>
          <h2>Payment</h2>
          <p>
            Worker payout: <strong>{shift.payment.status}</strong> — £
            {(shift.payment.totalAmountCents / 100).toFixed(2)} total (£
            {(shift.payment.workerAmountCents / 100).toFixed(2)} to worker, £
            {(shift.payment.commissionAmountCents / 100).toFixed(2)} commission)
          </p>
          {shift.payment.failureReason && (
            <p style={{ color: "#a55" }}>{shift.payment.failureReason}</p>
          )}
          <p>
            Your card charge:{" "}
            <strong>{shift.payment.venueChargeFailed ? "failed" : "succeeded"}</strong>
          </p>
          {shift.payment.venueChargeFailed && (
            <p style={{ color: "#a55" }}>
              {shift.payment.venueChargeFailureReason}
              {shift.payment.status === "paid_out" &&
                " The worker has already been paid for this shift regardless — this only affects your card."}
            </p>
          )}
          {(shift.payment.status === "pending_setup" ||
            shift.payment.status === "failed" ||
            shift.payment.venueChargeFailed) && (
            <button disabled={busy} onClick={handleRetryCharge}>
              Retry payment
            </button>
          )}
        </section>
      )}

      {shift.status === "completed" && shift.venueFeedback && (
        <section>
          <h2>Worker&apos;s rating of you</h2>
          {disputeSubmitted ? (
            <p>Dispute submitted.</p>
          ) : disputing ? (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <input
                placeholder="Reason (e.g. this doesn't match what happened)"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
              />
              <textarea
                placeholder="Note — give the details a reviewer would need"
                value={disputeNote}
                onChange={(e) => setDisputeNote(e.target.value)}
              />
              <div>
                <button disabled={busy} onClick={submitDispute}>Submit dispute</button>{" "}
                <button onClick={() => setDisputing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setDisputing(true)}>Dispute this</button>
          )}
        </section>
      )}
    </main>
  );
}
