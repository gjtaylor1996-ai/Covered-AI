"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { FavouritesPanel } from "../favourites-panel";
import { TimeInput, formatTime12h } from "@/components/TimeInput";
import { AppHeader } from "@/components/AppHeader";

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
    <div className="page">
      <AppHeader links={[{ href: "/", label: "Home" }, { href: "/venue/analytics", label: "Analytics" }]} />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "18px" }}>Your shifts</h1>

        <FavouritesPanel onBooked={loadShifts} />

        {trust && (
          <div className="card-dark score-hero">
            <div className="score-stamp">
              <div className="num">{trust.trustScore ?? "—"}</div>
              <div className="tag">{trust.trustTier}</div>
            </div>
            <div className="score-copy">
              <div className="lbl">Venue trust score</div>
              <p>
                Based on {trust.feedbackCount} worker rating{trust.feedbackCount === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
        )}

        {paymentMethodConnected === false && (
          <div className="why-box">
            <button className="btn primary" disabled={connecting} onClick={connectPaymentMethod} style={{ marginRight: "10px" }}>
              {connecting ? "Redirecting…" : "Add payment method"}
            </button>
            shifts won&apos;t be charged until a card is on file.
          </div>
        )}

        <div className="section-title">Post a shift</div>
        <form
          onSubmit={handleCreate}
          className="card"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}
        >
          <div className="field">
            <label>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as WorkerRoleKey)}
            >
              {Object.entries(WORKER_ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Start time</label>
            <TimeInput value={startTime} onChange={setStartTime} />
          </div>
          <div className="field">
            <label>End time</label>
            <TimeInput value={endTime} onChange={setEndTime} />
          </div>
          <div className="field">
            <label>Hourly rate (£)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              required
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          </div>
          <div style={{ alignSelf: "end", marginBottom: "12px" }}>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "Posting…" : "Post shift"}
            </button>
          </div>
        </form>

        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        <div className="section-title">All shifts</div>

        {shifts === null ? (
          <p className="text-muted">Loading…</p>
        ) : shifts.length === 0 ? (
          <p className="text-muted">No shifts posted yet.</p>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
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
                  <tr key={shift.id}>
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
          </div>
        )}
      </div>
    </div>
  );
}
