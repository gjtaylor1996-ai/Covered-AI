"use client";

import { useEffect, useState } from "react";
import { WORKER_ROLE_LABELS, type WorkerRoleKey } from "@/lib/types";

interface Favourite {
  id: string;
  name: string;
  primaryRole: WorkerRoleKey;
  hourlyRate: number;
  reliabilityScore: number | null;
  reliabilityTier: string;
}

export function FavouritesPanel({ onBooked }: { onBooked?: () => void }) {
  const [favourites, setFavourites] = useState<Favourite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [hiringId, setHiringId] = useState<string | null>(null);
  const [roleTitle, setRoleTitle] = useState("");
  const [salary, setSalary] = useState("24000");
  const [startDate, setStartDate] = useState("");
  const [feeOption, setFeeOption] = useState<"conversion_fee" | "extended_hire">("conversion_fee");

  async function load() {
    const res = await fetch("/api/venues/me/favourites");
    if (res.ok) {
      const body = await res.json();
      setFavourites(body.favourites);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function rebook(workerId: string) {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setBusyId(workerId);
    setError(null);
    const res = await fetch(`/api/venues/me/favourites/${workerId}/rebook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "worker_double_booked"
          ? "They already have a shift tomorrow — pick a shift manually instead."
          : "Could not rebook."
      );
      return;
    }
    setNotice("Shift created and offered for tomorrow 18:00–23:00.");
    onBooked?.();
  }

  async function proposeHire(e: React.FormEvent) {
    e.preventDefault();
    if (!hiringId) return;
    setBusyId(hiringId);
    setError(null);
    const res = await fetch("/api/hire-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workerId: hiringId,
        proposedRoleTitle: roleTitle,
        proposedSalary: Number.parseFloat(salary),
        proposedStartDate: startDate,
        feeOption,
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "already_pending" ? "A hire request is already pending for them." : "Could not send the hire request.");
      return;
    }
    setNotice("Hire request sent.");
    setHiringId(null);
  }

  if (!favourites || favourites.length === 0) return null;

  return (
    <section className="card">
      <div className="section-title" style={{ marginTop: 0 }}>Book again</div>
      <p className="text-muted" style={{ fontSize: "12.5px", margin: "0 0 12px" }}>
        One tap to re-request someone you&apos;ve starred as a favourite.
      </p>
      {notice && <p className="mono text-success" style={{ fontSize: "12.5px" }}>{notice}</p>}
      {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

      {favourites.map((f) => (
        <div key={f.id} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
          <div style={{ fontSize: "13.5px" }}>
            <strong>{f.name}</strong> — {WORKER_ROLE_LABELS[f.primaryRole]}, £{f.hourlyRate}/hr,{" "}
            {f.reliabilityScore ?? "—"} ({f.reliabilityTier})
          </div>
          <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
            <button className="btn primary" disabled={busyId === f.id} onClick={() => rebook(f.id)}>
              Rebook for tomorrow
            </button>
            <button
              className="btn ghost"
              disabled={busyId === f.id}
              onClick={() => {
                setHiringId(f.id);
                setRoleTitle(WORKER_ROLE_LABELS[f.primaryRole]);
              }}
            >
              Hire permanently
            </button>
          </div>
          {hiringId === f.id && (
            <form onSubmit={proposeHire} style={{ marginTop: "12px" }}>
              <div className="field">
                <label>Job title</label>
                <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} required />
              </div>
              <div className="field">
                <label>Proposed annual salary (£)</label>
                <input type="number" min="0" value={salary} onChange={(e) => setSalary(e.target.value)} required />
              </div>
              <div className="field">
                <label>Proposed start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              {/* UK Conduct of Employment Agencies and Employment Businesses
                  Regulations 2003 reg. 10: the fee is only enforceable if the
                  extended-hire alternative is offered alongside it — both
                  options are always shown together here, never just the fee. */}
              <fieldset style={{ marginBottom: "12px" }}>
                <legend>Fee option</legend>
                <div className="radio-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", padding: "6px 0" }}>
                  <label>
                    <input
                      type="radio"
                      checked={feeOption === "conversion_fee"}
                      onChange={() => setFeeOption("conversion_fee")}
                    />
                    Pay a one-off conversion fee (tiered by shifts completed)
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={feeOption === "extended_hire"}
                      onChange={() => setFeeOption("extended_hire")}
                    />
                    Extended hire period instead — no fee
                  </label>
                </div>
              </fieldset>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="submit" className="btn primary" disabled={busyId === f.id}>Send hire request</button>
                <button type="button" className="btn ghost" onClick={() => setHiringId(null)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
