"use client";

import { useState } from "react";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";
import { TimeInput } from "@/components/TimeInput";

interface VenueSummary {
  name: string;
  postcode: string;
  paymentConnected: boolean;
}

const TOTAL_STEPS = 3;

export function OnboardingWizard({
  venue,
  onComplete,
}: {
  venue: VenueSummary;
  onComplete: () => void;
}) {
  // Resume at the right step after a full-page round trip to Stripe and
  // back (its success/cancel redirect always lands on /venue/shifts,
  // which remounts this component) — infer progress from real data
  // rather than tracking step in a query param.
  const [step, setStep] = useState(() => {
    if (!venue.postcode) return 1;
    if (!venue.paymentConnected) return 2;
    return 3;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(venue.name);
  const [postcode, setPostcode] = useState(venue.postcode);

  const [role, setRole] = useState<WorkerRoleKey>("Bartender");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:00");
  const [hourlyRate, setHourlyRate] = useState("14");
  const [shiftPosted, setShiftPosted] = useState(false);

  async function finish() {
    setBusy(true);
    await fetch("/api/venues/me/onboarding/complete", { method: "POST" });
    setBusy(false);
    onComplete();
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/venues/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, postcode }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save — check the fields.");
      return;
    }
    setStep(2);
  }

  async function connectPayment() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/venues/me/stripe/setup-checkout", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not start payment setup.");
      return;
    }
    const body = await res.json();
    window.location.href = body.url;
  }

  async function postFirstShift(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, date, startTime, endTime, hourlyRate: Number.parseFloat(hourlyRate) }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not post shift — check the fields.");
      return;
    }
    setShiftPosted(true);
    await finish();
  }

  return (
    <div className="wizard-shell">
      <div className="wizard-card">
        <div className="wizard-topbar">
          <div className="wizard-topbar-row">
            <div className="wizard-brand">
              <div className="brand-mark">Co</div>
              <span>Covered</span>
            </div>
            <div className="wizard-step-label">{Math.min(step, TOTAL_STEPS)} / {TOTAL_STEPS}</div>
          </div>
          <div className="wizard-progress-track">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className={`wizard-progress-seg ${i < step - 1 ? "done" : ""}`} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <>
            <div className="wizard-body">
              <h2 className="wizard-step-title">Let&apos;s get the basics</h2>
              <p className="wizard-step-sub">This is what workers will see first.</p>
              <form id="wizard-form" onSubmit={saveDetails}>
                <div className="field">
                  <label>Venue name</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Postcode</label>
                  <input required value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. SE1 9GY" />
                </div>
                {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}
              </form>
            </div>
            <div className="wizard-nav">
              <button type="submit" form="wizard-form" className="btn primary" disabled={busy}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="wizard-body">
              <h2 className="wizard-step-title">Get set up to be charged</h2>
              <p className="wizard-step-sub">
                Connect a card so completed shifts can be charged automatically. You can do this later, but shifts
                won&apos;t be charged until a card is on file.
              </p>
              <div className="card-dark" style={{ textAlign: "center", padding: "22px 18px" }}>
                <div style={{ fontSize: "26px", marginBottom: "8px" }}>🏦</div>
                <h3 style={{ fontSize: "15px", margin: "0 0 6px" }}>
                  {venue.paymentConnected ? "Card connected" : "Connect a card"}
                </h3>
                <p style={{ fontSize: "11.5px", color: "var(--steel-light)", margin: "0 0 14px", lineHeight: 1.4 }}>
                  Secure, hosted checkout via Stripe. Covered never sees or stores your card details.
                </p>
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: "100%", borderColor: "var(--paper-light)" }}
                  disabled={busy}
                  onClick={connectPayment}
                >
                  {venue.paymentConnected ? "Reconnect a card" : "Connect a card"}
                </button>
              </div>
              {error && <p className="mono text-error" style={{ fontSize: "12.5px", marginTop: "10px" }}>{error}</p>}
            </div>
            <div className="wizard-nav">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep(3)}>
                Skip for now
              </button>
              <button type="button" className="btn primary" disabled={busy} onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="wizard-body">
              <h2 className="wizard-step-title">Post your first shift</h2>
              <p className="wizard-step-sub">Optional — you can always do this later from your dashboard.</p>
              <form id="wizard-form" onSubmit={postFirstShift}>
                <div className="field">
                  <label>Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as WorkerRoleKey)}>
                    {Object.entries(WORKER_ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Date</label>
                  <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Start time</label>
                    <TimeInput value={startTime} onChange={setStartTime} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>End time</label>
                    <TimeInput value={endTime} onChange={setEndTime} />
                  </div>
                </div>
                <div className="field">
                  <label>Hourly rate (£)</label>
                  <input type="number" min="0" step="0.5" required value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
                </div>
                {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}
              </form>
            </div>
            <div className="wizard-nav">
              <button type="button" className="btn ghost" disabled={busy} onClick={finish}>
                Skip for now
              </button>
              <button type="submit" form="wizard-form" className="btn primary" disabled={busy}>
                {shiftPosted ? "Posted ✓" : "Post shift & finish"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
