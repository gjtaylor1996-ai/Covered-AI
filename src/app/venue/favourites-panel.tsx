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
    <section style={{ border: "1px solid #ddd", padding: "1rem", marginBottom: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Book again</h2>
      <p style={{ color: "#555", margin: "0 0 0.75rem" }}>
        One tap to re-request someone you&apos;ve starred as a favourite.
      </p>
      {notice && <p style={{ color: "#276" }}>{notice}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {favourites.map((f) => (
          <li key={f.id} style={{ borderBottom: "1px solid #eee", padding: "0.5rem 0" }}>
            <strong>{f.name}</strong> — {WORKER_ROLE_LABELS[f.primaryRole]}, £{f.hourlyRate}/hr,{" "}
            {f.reliabilityScore ?? "—"} ({f.reliabilityTier}){" "}
            <button disabled={busyId === f.id} onClick={() => rebook(f.id)}>
              Rebook for tomorrow
            </button>{" "}
            <button
              disabled={busyId === f.id}
              onClick={() => {
                setHiringId(f.id);
                setRoleTitle(WORKER_ROLE_LABELS[f.primaryRole]);
              }}
            >
              Hire permanently
            </button>
            {hiringId === f.id && (
              <form onSubmit={proposeHire} style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
                <label>
                  Job title
                  <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} required style={{ display: "block", width: "100%" }} />
                </label>
                <label>
                  Proposed annual salary (£)
                  <input type="number" min="0" value={salary} onChange={(e) => setSalary(e.target.value)} required style={{ display: "block", width: "100%" }} />
                </label>
                <label>
                  Proposed start date
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={{ display: "block", width: "100%" }} />
                </label>
                {/* UK Conduct of Employment Agencies and Employment Businesses
                    Regulations 2003 reg. 10: the fee is only enforceable if the
                    extended-hire alternative is offered alongside it — both
                    options are always shown together here, never just the fee. */}
                <fieldset style={{ border: "1px solid #eee", padding: "0.5rem" }}>
                  <legend>Fee option</legend>
                  <label style={{ display: "block" }}>
                    <input
                      type="radio"
                      checked={feeOption === "conversion_fee"}
                      onChange={() => setFeeOption("conversion_fee")}
                    />{" "}
                    Pay a one-off conversion fee (tiered by shifts completed)
                  </label>
                  <label style={{ display: "block" }}>
                    <input
                      type="radio"
                      checked={feeOption === "extended_hire"}
                      onChange={() => setFeeOption("extended_hire")}
                    />{" "}
                    Extended hire period instead — no fee
                  </label>
                </fieldset>
                <div>
                  <button type="submit" disabled={busyId === f.id}>Send hire request</button>{" "}
                  <button type="button" onClick={() => setHiringId(null)}>Cancel</button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
