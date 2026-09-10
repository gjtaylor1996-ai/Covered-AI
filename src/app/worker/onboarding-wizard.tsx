"use client";

import { useState } from "react";
import { WORKER_ROLE_LABELS, type WeeklyAvailability, type WorkerRoleKey } from "@/lib/types";
import { TimeInput } from "@/components/TimeInput";

interface WorkerSummary {
  primaryRole: WorkerRoleKey;
  postcode: string;
  yearsExperience: number;
  hourlyRate: number;
  maxTravelDistanceMi: number;
  availability: WeeklyAvailability;
  dbsStatus: string;
  bankAccountConnected: boolean;
}

const DAYS: (keyof WeeklyAvailability)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const TOTAL_STEPS = 4;

export function OnboardingWizard({
  worker,
  onComplete,
}: {
  worker: WorkerSummary;
  onComplete: () => void;
}) {
  // Resume at the right step after a full-page round trip to Persona or
  // Stripe and back (both redirects always land on /worker/shifts,
  // which remounts this component) — infer progress from real data
  // rather than tracking step in a query param.
  const [step, setStep] = useState(() => {
    if (!worker.postcode) return 1;
    if (worker.bankAccountConnected) return 4;
    return 3;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbsStatus, setDbsStatus] = useState(worker.dbsStatus);

  const [role, setRole] = useState<WorkerRoleKey>(worker.primaryRole);
  const [postcode, setPostcode] = useState(worker.postcode);
  const [yearsExperience, setYearsExperience] = useState(String(worker.yearsExperience));
  const [hourlyRate, setHourlyRate] = useState(String(worker.hourlyRate || 12));

  const [maxTravelDistanceMi, setMaxTravelDistanceMi] = useState(worker.maxTravelDistanceMi || 15);
  const [availability, setAvailability] = useState(worker.availability);

  const [idDob, setIdDob] = useState("");
  const [idSubmitted, setIdSubmitted] = useState(false);
  const [rtwMethod, setRtwMethod] = useState<"share_code" | "manual_document">("share_code");
  const [shareCode, setShareCode] = useState("");
  const [rtwDob, setRtwDob] = useState("");
  const [rtwNationality, setRtwNationality] = useState<"British" | "Irish">("British");
  const [rtwPassportNumber, setRtwPassportNumber] = useState("");
  const [rtwSubmitted, setRtwSubmitted] = useState(false);
  const [dbsRef, setDbsRef] = useState("");
  const [dbsSubmitted, setDbsSubmitted] = useState(false);

  async function finish() {
    setBusy(true);
    await fetch("/api/workers/me/onboarding/complete", { method: "POST" });
    setBusy(false);
    onComplete();
  }

  async function saveBasics(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workers/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryRole: role,
        postcode,
        yearsExperience: Number.parseFloat(yearsExperience) || 0,
        hourlyRate: Number.parseFloat(hourlyRate) || 0,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save — check the fields.");
      return;
    }
    const body = await res.json();
    setDbsStatus(body.worker.dbsStatus);
    setStep(2);
  }

  async function saveAvailability(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workers/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxTravelDistanceMi, availability }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save — check the fields.");
      return;
    }
    setStep(3);
  }

  async function submitId(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setIdSubmitted(true);
    const res = await fetch("/api/workers/me/verification/id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: idDob }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setIdSubmitted(false);
      setError(
        body.error === "resubmission_cooldown"
          ? "Please wait before resubmitting."
          : "Could not start ID verification."
      );
      return;
    }
    window.location.href = body.url;
  }

  async function submitRtw(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workers/me/verification/right-to-work", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        rtwMethod === "share_code"
          ? { method: "share_code", shareCode, dateOfBirth: rtwDob }
          : { method: "manual_document", nationality: rtwNationality, passportNumber: rtwPassportNumber, dateOfBirth: rtwDob }
      ),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not submit — check the fields.");
      return;
    }
    setRtwSubmitted(true);
  }

  async function submitDbs(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workers/me/verification/dbs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationRef: dbsRef }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not submit DBS reference.");
      return;
    }
    setDbsSubmitted(true);
  }

  async function connectPayout() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workers/me/stripe/connect", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not start payout setup.");
      return;
    }
    const body = await res.json();
    window.location.href = body.url;
  }

  return (
    <div className="wizard-shell">
      <div className="wizard-card" style={{ maxWidth: 560 }}>
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
              <p className="wizard-step-sub">This is what venues will see first. Takes about 2 minutes.</p>
              <form id="wizard-form" onSubmit={saveBasics}>
                <div className="field">
                  <label>Primary role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as WorkerRoleKey)}>
                    {Object.entries(WORKER_ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Postcode</label>
                  <input required value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. SE1 9GY" />
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Years of experience</label>
                    <input type="number" min="0" step="0.5" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Hourly rate (£)</label>
                    <input type="number" min="0" step="0.5" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
                  </div>
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
              <h2 className="wizard-step-title">Where and when you can work</h2>
              <p className="wizard-step-sub">Shifts outside your radius or availability are never shown to you.</p>
              <form id="wizard-form" onSubmit={saveAvailability}>
                <div className="field">
                  <label>Max travel distance — {maxTravelDistanceMi} mi</label>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={maxTravelDistanceMi}
                    onChange={(e) => setMaxTravelDistanceMi(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>
                <label style={{ marginBottom: "6px" }}>Weekly availability</label>
                <div style={{ display: "grid", gap: "8px", marginBottom: "6px" }}>
                  {DAYS.map((day) => (
                    <div key={day} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          width: "4.5rem",
                          textTransform: "capitalize",
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          fontSize: "13px",
                          letterSpacing: "normal",
                          color: "var(--ink)",
                          marginBottom: 0,
                        }}
                      >
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={availability[day].enabled}
                          onChange={(e) =>
                            setAvailability((a) => ({ ...a, [day]: { ...a[day], enabled: e.target.checked } }))
                          }
                        />
                        {day.slice(0, 3)}
                      </label>
                      {availability[day].enabled && (
                        <>
                          <TimeInput
                            value={availability[day].start}
                            onChange={(v) => setAvailability((a) => ({ ...a, [day]: { ...a[day], start: v } }))}
                          />
                          <span className="text-muted" style={{ fontSize: "12.5px" }}>to</span>
                          <TimeInput
                            value={availability[day].end}
                            onChange={(v) => setAvailability((a) => ({ ...a, [day]: { ...a[day], end: v } }))}
                          />
                        </>
                      )}
                    </div>
                  ))}
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

        {step === 3 && (
          <>
            <div className="wizard-body">
              <h2 className="wizard-step-title">Identity &amp; right to work</h2>
              <p className="wizard-step-sub">Required before you can be booked for any shift — but you can do this later too.</p>

              <div className="card" style={{ marginBottom: "12px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>ID document</div>
                {idSubmitted ? (
                  <span className="badge pending">Submitted — redirecting…</span>
                ) : (
                  <form onSubmit={submitId}>
                    <div className="field" style={{ maxWidth: "220px" }}>
                      <label>Date of birth</label>
                      <input type="date" required value={idDob} onChange={(e) => setIdDob(e.target.value)} />
                    </div>
                    <button type="submit" className="btn primary" disabled={busy}>
                      Start ID verification
                    </button>
                  </form>
                )}
              </div>

              <div className="card" style={{ marginBottom: "12px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>Right to work</div>
                {rtwSubmitted ? (
                  <span className="badge pending">Submitted — an admin will confirm it</span>
                ) : (
                  <form onSubmit={submitRtw}>
                    <div className="radio-row" style={{ marginBottom: "10px" }}>
                      <label>
                        <input type="radio" checked={rtwMethod === "share_code"} onChange={() => setRtwMethod("share_code")} />
                        Share code
                      </label>
                      <label>
                        <input type="radio" checked={rtwMethod === "manual_document"} onChange={() => setRtwMethod("manual_document")} />
                        British/Irish citizen
                      </label>
                    </div>
                    {rtwMethod === "share_code" ? (
                      <div className="field" style={{ maxWidth: "220px" }}>
                        <label>Share code</label>
                        <input value={shareCode} onChange={(e) => setShareCode(e.target.value)} maxLength={9} placeholder="e.g. W9ND2SGW3" />
                      </div>
                    ) : (
                      <>
                        <div className="field" style={{ maxWidth: "220px" }}>
                          <label>Nationality</label>
                          <select value={rtwNationality} onChange={(e) => setRtwNationality(e.target.value as "British" | "Irish")}>
                            <option value="British">British</option>
                            <option value="Irish">Irish</option>
                          </select>
                        </div>
                        <div className="field" style={{ maxWidth: "220px" }}>
                          <label>Passport number</label>
                          <input value={rtwPassportNumber} onChange={(e) => setRtwPassportNumber(e.target.value)} />
                        </div>
                      </>
                    )}
                    <div className="field" style={{ maxWidth: "220px" }}>
                      <label>Date of birth</label>
                      <input type="date" required value={rtwDob} onChange={(e) => setRtwDob(e.target.value)} />
                    </div>
                    <button type="submit" className="btn primary" disabled={busy}>Submit</button>
                  </form>
                )}
              </div>

              {dbsStatus !== "not_required" && (
                <div className="card">
                  <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>DBS check</div>
                  {dbsSubmitted ? (
                    <span className="badge pending">Submitted — an admin will confirm it</span>
                  ) : (
                    <form onSubmit={submitDbs}>
                      <div className="field" style={{ maxWidth: "260px" }}>
                        <label>DBS application reference</label>
                        <input value={dbsRef} onChange={(e) => setDbsRef(e.target.value)} />
                      </div>
                      <button type="submit" className="btn primary" disabled={busy}>Submit</button>
                    </form>
                  )}
                </div>
              )}

              {error && <p className="mono text-error" style={{ fontSize: "12.5px", marginTop: "10px" }}>{error}</p>}
            </div>
            <div className="wizard-nav">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep(4)}>
                Skip for now
              </button>
              <button type="button" className="btn primary" disabled={busy} onClick={() => setStep(4)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="wizard-body">
              <h2 className="wizard-step-title">Get paid</h2>
              <p className="wizard-step-sub">Connect a bank account so you&apos;re paid automatically after each completed shift.</p>
              <div className="card-dark" style={{ textAlign: "center", padding: "22px 18px" }}>
                <div style={{ fontSize: "26px", marginBottom: "8px" }}>🏦</div>
                <h3 style={{ fontSize: "15px", margin: "0 0 6px" }}>
                  {worker.bankAccountConnected ? "Bank account connected" : "Connect your bank"}
                </h3>
                <p style={{ fontSize: "11.5px", color: "var(--steel-light)", margin: "0 0 14px", lineHeight: 1.4 }}>
                  Secure, read-only connection via Stripe. Covered never sees or stores your login details.
                </p>
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: "100%", borderColor: "var(--paper-light)" }}
                  disabled={busy}
                  onClick={connectPayout}
                >
                  {worker.bankAccountConnected ? "Manage bank account" : "Connect bank account"}
                </button>
              </div>
              <p className="text-muted" style={{ fontSize: "11.5px", marginTop: "10px" }}>
                Paid weekly, every Friday, for all shifts completed that week.
              </p>
              {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}
            </div>
            <div className="wizard-nav">
              <button type="button" className="btn ghost" disabled={busy} onClick={finish}>
                Skip for now
              </button>
              <button type="button" className="btn primary" disabled={busy} onClick={finish}>
                Finish
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
