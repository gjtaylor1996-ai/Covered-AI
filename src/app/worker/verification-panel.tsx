"use client";

import { useEffect, useState } from "react";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

interface WorkerProfileFull {
  id: string;
  primaryRole: WorkerRoleKey;
  postcode: string;
  yearsExperience: number;
  hourlyRate: number;
  maxTravelDistanceMi: number;
  rightToWorkStatus: string;
  idVerificationStatus: string;
  dbsStatus: string;
}

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

  const [idDob, setIdDob] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [rtwDob, setRtwDob] = useState("");
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
    const form = new FormData(e.currentTarget);
    form.set("dateOfBirth", idDob);
    const res = await fetch("/api/workers/me/verification/id", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "resubmission_cooldown"
          ? "Please wait before resubmitting."
          : "Could not submit ID verification — check your Stripe/Onfido setup in .env."
      );
      return;
    }
    setNotice("ID submitted — awaiting result.");
    await load();
  }

  async function submitRtw(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workers/me/verification/right-to-work", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareCode, dateOfBirth: rtwDob }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "resubmission_cooldown"
          ? "Please wait before resubmitting."
          : "Could not submit — check the share code format (9 characters)."
      );
      return;
    }
    setNotice("Share code submitted — an admin will confirm it shortly.");
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

  return (
    <section style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Profile &amp; verification</h2>
      {notice && <p style={{ color: "#276" }}>{notice}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <details open={!profile.postcode}>
        <summary>Profile ({WORKER_ROLE_LABELS[profile.primaryRole]}, {profile.postcode || "no postcode set"})</summary>
        <form onSubmit={saveProfile} style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as WorkerRoleKey)} style={{ display: "block", width: "100%" }}>
              {Object.entries(WORKER_ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Postcode
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Years experience
            <input type="number" min="0" step="0.5" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Hourly rate (£)
            <input type="number" min="0" step="0.5" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Max travel distance (mi)
            <input type="number" min="0" value={maxTravelDistanceMi} onChange={(e) => setMaxTravelDistanceMi(e.target.value)} style={{ display: "block", width: "100%" }} />
          </label>
          <button type="submit" disabled={busy}>Save profile</button>
        </form>
      </details>

      <hr style={{ margin: "1rem 0" }} />

      <p>ID verification: <strong>{profile.idVerificationStatus}</strong></p>
      {profile.idVerificationStatus !== "verified" && (
        <form onSubmit={submitId} style={{ display: "grid", gap: "0.5rem" }}>
          <label>
            Date of birth
            <input type="date" required value={idDob} onChange={(e) => setIdDob(e.target.value)} style={{ display: "block" }} />
          </label>
          <label>
            Passport / photo ID (front)
            <input type="file" name="documentFront" accept="image/*" required style={{ display: "block" }} />
          </label>
          <label>
            Selfie
            <input type="file" name="livePhoto" accept="image/*" required style={{ display: "block" }} />
          </label>
          <button type="submit" disabled={busy}>Submit ID verification</button>
        </form>
      )}

      <hr style={{ margin: "1rem 0" }} />

      <p>Right to work: <strong>{profile.rightToWorkStatus}</strong></p>
      {profile.rightToWorkStatus !== "verified" && (
        <form onSubmit={submitRtw} style={{ display: "grid", gap: "0.5rem" }}>
          <p style={{ color: "#555", margin: 0 }}>
            Get a share code at{" "}
            <a href="https://www.gov.uk/prove-right-to-work" target="_blank" rel="noreferrer">
              gov.uk/prove-right-to-work
            </a>.
          </p>
          <label>
            Share code
            <input
              value={shareCode}
              onChange={(e) => setShareCode(e.target.value)}
              maxLength={9}
              placeholder="e.g. W9ND2SGW3"
              style={{ display: "block" }}
            />
          </label>
          <label>
            Date of birth
            <input type="date" required value={rtwDob} onChange={(e) => setRtwDob(e.target.value)} style={{ display: "block" }} />
          </label>
          <button type="submit" disabled={busy}>Submit share code</button>
        </form>
      )}

      {profile.dbsStatus !== "not_required" && (
        <>
          <hr style={{ margin: "1rem 0" }} />
          <p>DBS check: <strong>{profile.dbsStatus}</strong></p>
          {profile.dbsStatus !== "verified" && (
            <form onSubmit={submitDbs} style={{ display: "grid", gap: "0.5rem" }}>
              <label>
                DBS application reference
                <input value={dbsRef} onChange={(e) => setDbsRef(e.target.value)} style={{ display: "block" }} />
              </label>
              <button type="submit" disabled={busy}>Submit DBS reference</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
