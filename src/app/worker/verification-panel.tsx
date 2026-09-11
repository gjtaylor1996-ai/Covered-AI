"use client";

import { useEffect, useState } from "react";
import { WORKER_ROLE_LABELS, type WeeklyAvailability, type WorkerRoleKey } from "@/lib/types";
import { TimeInput } from "@/components/TimeInput";

interface WorkerProfileFull {
  id: string;
  primaryRole: WorkerRoleKey;
  postcode: string;
  yearsExperience: number;
  hourlyRate: number;
  maxTravelDistanceMi: number;
  availability: WeeklyAvailability;
  rightToWorkStatus: string;
  idVerificationStatus: string;
  dbsStatus: string;
  cvFileName: string | null;
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

export function VerificationPanel() {
  const [profile, setProfile] = useState<WorkerProfileFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [role, setRole] = useState<WorkerRoleKey>("Bartender");
  const [postcode, setPostcode] = useState("");
  const [yearsExperience, setYearsExperience] = useState("0");
  const [hourlyRate, setHourlyRate] = useState("12");
  const [maxTravelDistanceMi, setMaxTravelDistanceMi] = useState("10");
  const [availability, setAvailability] = useState<WeeklyAvailability | null>(null);

  const [idDob, setIdDob] = useState("");
  const [rtwMethod, setRtwMethod] = useState<"share_code" | "manual_document">("share_code");
  const [shareCode, setShareCode] = useState("");
  const [rtwDob, setRtwDob] = useState("");
  const [rtwNationality, setRtwNationality] = useState<"British" | "Irish">("British");
  const [rtwPassportNumber, setRtwPassportNumber] = useState("");
  const [dbsRef, setDbsRef] = useState("");

  async function load() {
    const res = await fetch("/api/workers/me");
    if (!res.ok) return;
    const body = await res.json();
    const w: WorkerProfileFull = body.worker;
    setProfile(w);
    setRole(w.primaryRole);
    setPostcode(w.postcode);
    setYearsExperience(String(w.yearsExperience));
    setHourlyRate(String(w.hourlyRate));
    setMaxTravelDistanceMi(String(w.maxTravelDistanceMi));
    setAvailability(w.availability);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProfile(e: React.FormEvent) {
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
        maxTravelDistanceMi: Number.parseFloat(maxTravelDistanceMi) || 0,
        availability,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save profile.");
      return;
    }
    setNotice("Profile saved.");
    await load();
  }

  async function submitId(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workers/me/verification/id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateOfBirth: idDob }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(
        body.error === "resubmission_cooldown"
          ? "Please wait before resubmitting."
          : "Could not start ID verification — check your Persona setup in .env."
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
          : {
              method: "manual_document",
              nationality: rtwNationality,
              passportNumber: rtwPassportNumber,
              dateOfBirth: rtwDob,
            }
      ),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "resubmission_cooldown"
          ? "Please wait before resubmitting."
          : rtwMethod === "share_code"
          ? "Could not submit — check the share code format (9 characters)."
          : "Could not submit — check the passport number and date of birth."
      );
      return;
    }
    setNotice(
      rtwMethod === "share_code"
        ? "Share code submitted — an admin will confirm it shortly."
        : "Details submitted — an admin will arrange to check your original passport in person."
    );
    await load();
  }

  async function uploadCv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("cv", file);
    const res = await fetch("/api/workers/me/cv", { method: "POST", body: form });
    setBusy(false);
    e.target.value = "";
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "pdf_only"
          ? "CV must be a PDF."
          : body.error === "file_too_large"
            ? "That file is too large (4MB max)."
            : "Could not upload CV."
      );
      return;
    }
    setNotice("CV uploaded.");
    await load();
  }

  async function removeCv() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workers/me/cv", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not remove CV.");
      return;
    }
    setNotice("CV removed.");
    await load();
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
    setNotice("DBS reference submitted — an admin will confirm it shortly.");
    await load();
  }

  if (!profile) return null;

  function statusBadge(status: string) {
    return <span className={`badge ${status}`} style={{ marginTop: 0 }}>{status.replace("_", " ")}</span>;
  }

  function cardHeader(title: string, status: string) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{title}</div>
        {statusBadge(status)}
      </div>
    );
  }

  return (
    <section>
      <div className="section-title" style={{ marginTop: 0 }}>Profile &amp; verification</div>
      {notice && <p className="mono" style={{ color: "var(--green)", fontSize: "12.5px" }}>{notice}</p>}
      {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

      <details className="card" open={!profile.postcode}>
        <summary style={{ cursor: "pointer", fontSize: "13.5px", fontWeight: 600 }}>
          Profile ({WORKER_ROLE_LABELS[profile.primaryRole]}, {profile.postcode || "no postcode set"})
        </summary>
        <form onSubmit={saveProfile} style={{ marginTop: "12px" }}>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as WorkerRoleKey)}>
              {Object.entries(WORKER_ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Postcode</label>
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
          <div className="field">
            <label>Years experience</label>
            <input type="number" min="0" step="0.5" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} />
          </div>
          <div className="field">
            <label>Hourly rate (£)</label>
            <input type="number" min="0" step="0.5" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
          </div>
          <div className="field">
            <label>Max travel distance (mi)</label>
            <input type="number" min="0" value={maxTravelDistanceMi} onChange={(e) => setMaxTravelDistanceMi(e.target.value)} />
          </div>
          {availability && (
            <div className="field">
              <label>Available on</label>
              <div style={{ display: "grid", gap: "8px", marginTop: "4px" }}>
                {DAYS.map((day) => (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        width: "3.5rem",
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
                          setAvailability((a) =>
                            a ? { ...a, [day]: { ...a[day], enabled: e.target.checked } } : a
                          )
                        }
                      />
                      {day.slice(0, 3)}
                    </label>
                    {availability[day].enabled && (
                      <>
                        <TimeInput
                          value={availability[day].start}
                          onChange={(v) =>
                            setAvailability((a) => (a ? { ...a, [day]: { ...a[day], start: v } } : a))
                          }
                        />
                        <span className="text-muted" style={{ fontSize: "12.5px" }}>to</span>
                        <TimeInput
                          value={availability[day].end}
                          onChange={(v) =>
                            setAvailability((a) => (a ? { ...a, [day]: { ...a[day], end: v } } : a))
                          }
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button type="submit" className="btn primary" disabled={busy}>Save profile</button>
        </form>
      </details>

      <div className="card">
        {cardHeader("ID verification", profile.idVerificationStatus)}
        {profile.idVerificationStatus !== "verified" && (
          <form onSubmit={submitId} style={{ marginTop: "12px" }}>
            <p className="text-muted" style={{ fontSize: "12.5px", margin: "0 0 10px" }}>
              You&apos;ll be redirected to Persona to scan your ID and take a selfie.
            </p>
            <div className="field" style={{ maxWidth: "220px" }}>
              <label>Date of birth</label>
              <input type="date" required value={idDob} onChange={(e) => setIdDob(e.target.value)} />
            </div>
            <button type="submit" className="btn primary" disabled={busy}>Start ID verification</button>
          </form>
        )}
      </div>

      <div className="card">
        {cardHeader("Right to work", profile.rightToWorkStatus)}
        {profile.rightToWorkStatus !== "verified" && (
          <form onSubmit={submitRtw} style={{ marginTop: "12px" }}>
            <div className="radio-row" style={{ marginBottom: "12px" }}>
              <label>
                <input
                  type="radio"
                  name="rtwMethod"
                  checked={rtwMethod === "share_code"}
                  onChange={() => setRtwMethod("share_code")}
                />
                I have a share code
              </label>
              <label>
                <input
                  type="radio"
                  name="rtwMethod"
                  checked={rtwMethod === "manual_document"}
                  onChange={() => setRtwMethod("manual_document")}
                />
                I&apos;m a British or Irish citizen
              </label>
            </div>

            {rtwMethod === "share_code" ? (
              <>
                <p className="text-muted" style={{ fontSize: "12.5px", margin: "0 0 10px" }}>
                  Get a share code at{" "}
                  <a href="https://www.gov.uk/prove-right-to-work" target="_blank" rel="noreferrer">
                    gov.uk/prove-right-to-work
                  </a>.
                </p>
                <div className="field" style={{ maxWidth: "220px" }}>
                  <label>Share code</label>
                  <input
                    value={shareCode}
                    onChange={(e) => setShareCode(e.target.value)}
                    maxLength={9}
                    placeholder="e.g. W9ND2SGW3"
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-muted" style={{ fontSize: "12.5px", margin: "0 0 10px" }}>
                  British and Irish citizens aren&apos;t issued a share code. Enter your details below
                  and bring your original passport in — an admin will need to check it in person
                  before this can be verified.
                </p>
                <div className="field" style={{ maxWidth: "220px" }}>
                  <label>Nationality</label>
                  <select
                    value={rtwNationality}
                    onChange={(e) => setRtwNationality(e.target.value as "British" | "Irish")}
                  >
                    <option value="British">British</option>
                    <option value="Irish">Irish</option>
                  </select>
                </div>
                <div className="field" style={{ maxWidth: "220px" }}>
                  <label>Passport number</label>
                  <input
                    value={rtwPassportNumber}
                    onChange={(e) => setRtwPassportNumber(e.target.value)}
                    placeholder="e.g. 123456789"
                  />
                </div>
              </>
            )}

            <div className="field" style={{ maxWidth: "220px" }}>
              <label>Date of birth</label>
              <input type="date" required value={rtwDob} onChange={(e) => setRtwDob(e.target.value)} />
            </div>
            <button type="submit" className="btn primary" disabled={busy}>
              {rtwMethod === "share_code" ? "Submit share code" : "Submit details"}
            </button>
          </form>
        )}
      </div>

      {profile.dbsStatus !== "not_required" && (
        <div className="card">
          {cardHeader("DBS check", profile.dbsStatus)}
          {profile.dbsStatus !== "verified" && (
            <form onSubmit={submitDbs} style={{ marginTop: "12px" }}>
              <div className="field" style={{ maxWidth: "260px" }}>
                <label>DBS application reference</label>
                <input value={dbsRef} onChange={(e) => setDbsRef(e.target.value)} />
              </div>
              <button type="submit" className="btn primary" disabled={busy}>Submit DBS reference</button>
            </form>
          )}
        </div>
      )}

      <div className="card">
        <p style={{ fontSize: "13.5px", marginBottom: "8px" }}>
          CV{" "}
          <span className="text-muted" style={{ fontSize: "12px" }}>
            (optional — not used for shift matching, purely for venues who want it)
          </span>
        </p>
        <div className="doc-card">
          <div className="doc-card-info">
            <div className="doc-icon">📄</div>
            <div style={{ minWidth: 0 }}>
              <div className="doc-name">{profile.cvFileName ?? "No CV uploaded"}</div>
              {profile.cvFileName && <div className="doc-sub">PDF · uploaded</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <label
              className={`upload-btn ${profile.cvFileName ? "done" : ""}`}
              style={busy ? { pointerEvents: "none", opacity: 0.6 } : undefined}
            >
              {busy ? "Uploading…" : profile.cvFileName ? "Replace" : "Upload"}
              <input type="file" accept="application/pdf" disabled={busy} onChange={uploadCv} />
            </label>
            {profile.cvFileName && (
              <button type="button" className="btn ghost" disabled={busy} onClick={removeCv}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
