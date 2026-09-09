"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { FavouritesPanel } from "../favourites-panel";
import { TimeInput, formatTime12h } from "@/components/TimeInput";

interface ShiftListItem {
  id: string;
  role: WorkerRoleKey;
  date: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  status: string;
  worker: { id: string; name: string } | null;
}

interface TrustBreakdown {
  trustScore: number | null;
  trustTier: string;
  feedbackCount: number;
}

export default function VenueShiftsPage() {
  const [shifts, setShifts] = useState<ShiftListItem[] | null>(null);
  const [trust, setTrust] = useState<TrustBreakdown | null>(null);
  const [paymentMethodConnected, setPaymentMethodConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<WorkerRoleKey>("Bartender");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:00");
  const [hourlyRate, setHourlyRate] = useState("14");
  const [submitting, setSubmitting] = useState(false);

  async function loadShifts() {
    const res = await fetch("/api/shifts");
    if (!res.ok) {
      setError("Could not load shifts — are you logged in as a venue?");
      return;
    }
    const body = await res.json();
    setShifts(body.shifts);
  }

  async function loadTrust() {
    const res = await fetch("/api/venues/me/trust-score");
    if (res.ok) {
      const body = await res.json();
      setTrust(body.breakdown);
    }
  }

  async function loadPaymentStatus() {
    const res = await fetch("/api/me");
    if (res.ok) {
      const body = await res.json();
      setPaymentMethodConnected(
        Boolean(body.user.venueMemberships?.[0]?.venue?.stripeCustomerId)
      );
    }
  }

  useEffect(() => {
    loadShifts();
    loadTrust();
    loadPaymentStatus();
  }, []);

  async function connectPaymentMethod() {
    setConnecting(true);
    setError(null);
    const res = await fetch("/api/venues/me/stripe/setup-checkout", { method: "POST" });
    setConnecting(false);
    if (!res.ok) {
      setError("Could not start payment method setup.");
      return;
    }
    const body = await res.json();
    window.location.href = body.url;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        date,
        startTime,
        endTime,
        hourlyRate: Number.parseFloat(hourlyRate),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Could not create shift — check the fields.");
      return;
    }
    setDate("");
    await loadShifts();
  }

  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>
      <p>
        <Link href="/">&larr; Home</Link> · <Link href="/venue/analytics">Analytics</Link>
      </p>
      <h1>Your shifts</h1>

      <FavouritesPanel onBooked={loadShifts} />

      {trust && (
        <div style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "1.5rem" }}>
          <strong>
            Trust score: {trust.trustScore ?? "—"} ({trust.trustTier})
          </strong>
          <p style={{ margin: "0.25rem 0 0", color: "#555" }}>
            Based on {trust.feedbackCount} worker rating{trust.feedbackCount === 1 ? "" : "s"}.
          </p>
        </div>
      )}

      {paymentMethodConnected === false && (
        <p>
          <button disabled={connecting} onClick={connectPaymentMethod}>
            {connecting ? "Redirecting…" : "Add payment method"}
          </button>{" "}
          — shifts won&apos;t be charged until a card is on file.
        </p>
      )}

      <form
        onSubmit={handleCreate}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          border: "1px solid #ddd",
          padding: "1rem",
          marginBottom: "2rem",
        }}
      >
        <label>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as WorkerRoleKey)}
            style={{ display: "block", width: "100%" }}
          >
            {Object.entries(WORKER_ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          Start time
          <div style={{ marginTop: "0.25rem" }}>
            <TimeInput value={startTime} onChange={setStartTime} />
          </div>
        </label>
        <label>
          End time
          <div style={{ marginTop: "0.25rem" }}>
            <TimeInput value={endTime} onChange={setEndTime} />
          </div>
        </label>
        <label>
          Hourly rate (£)
          <input
            type="number"
            min="0"
            step="0.5"
            required
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <div style={{ alignSelf: "end" }}>
          <button type="submit" disabled={submitting}>
            {submitting ? "Posting…" : "Post shift"}
          </button>
        </div>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {shifts === null ? (
        <p>Loading…</p>
      ) : shifts.length === 0 ? (
        <p>No shifts posted yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th>Role</th>
              <th>Date</th>
              <th>Time</th>
              <th>Rate</th>
              <th>Status</th>
              <th>Worker</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>
                  <Link href={`/venue/shifts/${shift.id}`}>
                    {WORKER_ROLE_LABELS[shift.role]}
                  </Link>
                </td>
                <td>{new Date(shift.date).toLocaleDateString("en-GB")}</td>
                <td>
                  {formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}
                </td>
                <td>£{shift.hourlyRate}/hr</td>
                <td>{shift.status}</td>
                <td>{shift.worker?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
