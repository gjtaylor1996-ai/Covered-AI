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

  async function uploadCv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("cv") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("cv", file);
    const res = await fetch("/api/workers/me/cv", { method: "POST", body: form });
    setBusy(false);
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
    input.value = "";
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
          {availability && (
            <div>
              Available on
              <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.25rem" }}>
                {DAYS.map((day) => (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", width: "3.5rem" }}>
                      <input
                        type="checkbox"
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
                        <span>to</span>
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
          <button type="submit" disabled={busy}>Save profile</button>
        </form>
      </details>

      <hr style={{ margin: "1rem 0" }} />

      <p>ID verification: <strong>{profile.idVerificationStatus}</strong></p>
      {profile.idVerificationStatus !== "verified" && (
        <form onSubmit={submitId} style={{ display: "grid", gap: "0.5rem" }}>
          <p style={{ color: "#555", margin: 0 }}>
            You&apos;ll be redirected to Persona to scan your ID and take a selfie.
          </p>
          <label>
            Date of birth
            <input type="date" required value={idDob} onChange={(e) => setIdDob(e.target.value)} style={{ display: "block" }} />
          </label>
          <button type="submit" disabled={busy}>Start ID verification</button>
        </form>
      )}

      <hr style={{ margin: "1rem 0" }} />

      <p>Right to work: <strong>{profile.rightToWorkStatus}</strong></p>
      {profile.rightToWorkStatus !== "verified" && (
        <form onSubmit={submitRtw} style={{ display: "grid", gap: "0.5rem" }}>
          <div>
            <label style={{ marginRight: "1rem" }}>
              <input
                type="radio"
                name="rtwMethod"
                checked={rtwMethod === "share_code"}
                onChange={() => setRtwMethod("share_code")}
              />{" "}
              I have a share code
            </label>
            <label>
              <input
                type="radio"
                name="rtwMethod"
                checked={rtwMethod === "manual_document"}
                onChange={() => setRtwMethod("manual_document")}
              />{" "}
              I&apos;m a British or Irish citizen
            </label>
          </div>

          {rtwMethod === "share_code" ? (
            <>
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
            </>
          ) : (
            <>
              <p style={{ color: "#555", margin: 0 }}>
                British and Irish citizens aren&apos;t issued a share code. Enter your details below
                and bring your original passport in — an admin will need to check it in person
                before this can be verified.
              </p>
              <label>
                Nationality
                <select
                  value={rtwNationality}
                  onChange={(e) => setRtwNationality(e.target.value as "British" | "Irish")}
                  style={{ display: "block" }}
                >
                  <option value="British">British</option>
                  <option value="Irish">Irish</option>
                </select>
              </label>
              <label>
                Passport number
                <input
                  value={rtwPassportNumber}
                  onChange={(e) => setRtwPassportNumber(e.target.value)}
                  placeholder="e.g. 123456789"
                  style={{ display: "block" }}
                />
              </label>
            </>
          )}

          <label>
            Date of birth
            <input type="date" required value={rtwDob} onChange={(e) => setRtwDob(e.target.value)} style={{ display: "block" }} />
          </label>
          <button type="submit" disabled={busy}>
            {rtwMethod === "share_code" ? "Submit share code" : "Submit details"}
          </button>
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

      <hr style={{ margin: "1rem 0" }} />

      <p>
        CV <span style={{ color: "#555" }}>(optional — not used for shift matching, purely for venues who want it)</span>:{" "}
        <strong>{profile.cvFileName ?? "none uploaded"}</strong>
      </p>
      <form onSubmit={uploadCv} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input type="file" name="cv" accept="application/pdf" />
        <button type="submit" disabled={busy}>
          {profile.cvFileName ? "Replace" : "Upload"}
        </button>
        {profile.cvFileName && (
          <button type="button" disabled={busy} onClick={removeCv}>
            Remove
          </button>
        )}
      </form>
    </section>
  );
}
