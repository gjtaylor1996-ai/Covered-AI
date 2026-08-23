"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

interface PaymentInfo {
  status: string;
  workerAmountCents: number;
  commissionAmountCents: number;
  totalAmountCents: number;
  failureReason: string | null;
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
}

export default function VenueShiftDetailPage() {
  const params = useParams<{ id: string }>();
  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confirmedAttendance, setConfirmedAttendance] = useState(true);
  const [onTime, setOnTime] = useState(true);
  const [minutesLate, setMinutesLate] = useState("0");

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
    fetch(`/api/candidates?role=${shift.role}`)
      .then((res) => res.json())
      .then((body) => setCandidates(body.candidates))
      .catch(() => setError("Could not load candidates."));
  }, [shift?.status, shift?.role]);

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
        {new Date(shift.date).toLocaleDateString("en-GB")}, {shift.startTime}–
        {shift.endTime} · £{shift.hourlyRate}/hr
      </p>
      <p>
        Status: <strong>{shift.status}</strong>
      </p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {shift.status === "open" && (
        <section>
          <h2>Offer to a candidate</h2>
          {candidates === null ? (
            <p>Loading candidates…</p>
          ) : candidates.length === 0 ? (
            <p>No candidates found for this role yet.</p>
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
                    {c.name} — {c.yearsExperience}y exp,{" "}
                    {c.reliabilityScore !== null
                      ? `${c.reliabilityScore} (${c.reliabilityTier})`
                      : c.reliabilityTier}
                    , {c.shiftsCompleted} shifts completed
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
            Status: <strong>{shift.payment.status}</strong> — £
            {(shift.payment.totalAmountCents / 100).toFixed(2)} total (£
            {(shift.payment.workerAmountCents / 100).toFixed(2)} to worker, £
            {(shift.payment.commissionAmountCents / 100).toFixed(2)} commission)
          </p>
          {shift.payment.failureReason && (
            <p style={{ color: "#a55" }}>{shift.payment.failureReason}</p>
          )}
          {(shift.payment.status === "pending_setup" || shift.payment.status === "failed") && (
            <button disabled={busy} onClick={handleRetryCharge}>
              Retry payment
            </button>
          )}
        </section>
      )}
    </main>
  );
}
