"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";

interface Funnel {
  steps: {
    signedUp: number;
    onboarded: number;
    startedChecks: number;
    approved: number;
    gotOffer: number;
    completedShift: number;
  };
  last7Days: number;
  weeks: { weekEnding: string; signedUp: number }[];
  sources: { key: string; label: string; signedUp: number; approved: number }[];
  targets: { signedUp: number[]; approved: number[] };
  asOf: string;
}

const MILESTONES = ["Before the first venue goes live", "End of week 4", "End of week 8"];

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function Progress({ value, target }: { value: number; target: number }) {
  const w = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const done = value >= target;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ flex: 1, height: "10px", background: "var(--paper)", borderRadius: "5px", overflow: "hidden", border: "1px solid var(--line)" }}>
        <div style={{ width: `${w}%`, height: "100%", background: done ? "var(--green)" : "var(--amber)" }} />
      </div>
      <span className="mono" style={{ fontSize: "12px", minWidth: "64px", textAlign: "right" }}>
        {value} / {target}
      </span>
    </div>
  );
}

export default function WorkerFunnelPage() {
  const [data, setData] = useState<Funnel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/worker-funnel")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Could not load the worker funnel — are you logged in as an admin?"));
  }, []);

  const s = data?.steps;
  const rows: [string, number | undefined, string][] = s
    ? [
        ["Signed up", s.signedUp, "Created a worker account"],
        ["Finished onboarding", s.onboarded, "Completed the setup wizard (skipping steps counts)"],
        ["Started their checks", s.startedChecks, "Submitted ID, right-to-work or DBS details"],
        ["Approved", s.approved, "ID and right to work verified (and DBS where the role needs it), so they appear in venue search"],
        ["Had a shift offered", s.gotOffer, "At least one shift offered to them"],
        ["Completed a shift", s.completedShift, "At least one shift completed"],
      ]
    : [];
  const maxWeek = data ? Math.max(1, ...data.weeks.map((w) => w.signedUp)) : 1;

  return (
    <div className="page">
      <AppHeader
        links={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/verification", label: "Verification" },
          { href: "/admin/signups", label: "Signups" },
          { href: "/admin/dashboard", label: "Dashboard" },
        ]}
      />
      <div className="content">
        <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>Worker funnel</h1>
        <p className="text-muted why-box" style={{ marginTop: 0 }}>
          How many workers have signed up and how far each has got, against the worker outreach plan.
          Counts only. Admin-only, never shown to workers or venues.
        </p>
        {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}

        {data && s && (
          <>
            <div className="stat-grid" style={{ marginTop: "18px" }}>
              <div className="stat-tile"><div className="stat-label">Signed up</div><div className="stat-value">{s.signedUp}</div></div>
              <div className="stat-tile"><div className="stat-label">Last 7 days</div><div className="stat-value">{data.last7Days}</div></div>
              <div className="stat-tile"><div className="stat-label">Approved</div><div className="stat-value">{s.approved}</div></div>
              <div className="stat-tile"><div className="stat-label">Completed a shift</div><div className="stat-value">{s.completedShift}</div></div>
            </div>

            <div className="section-title">Progress against the plan</div>
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th style={{ width: "34%" }}>Signed up</th>
                    <th style={{ width: "34%" }}>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {MILESTONES.map((m, i) => (
                    <tr key={m}>
                      <td>{m}</td>
                      <td><Progress value={s.signedUp} target={data.targets.signedUp[i] ?? 0} /></td>
                      <td><Progress value={s.approved} target={data.targets.approved[i] ?? 0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted" style={{ fontSize: "12px", margin: "10px 0 0" }}>
                Targets are proposals from the outreach plan. They can be changed in the app's settings without a redeploy.
              </p>
            </div>

            <div className="section-title">The funnel</div>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Workers</th>
                    <th>Of signed up</th>
                    <th>From previous step</th>
                    <th>What it means</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, n, note], i) => (
                    <tr key={label}>
                      <td><strong>{label}</strong></td>
                      <td>{n}</td>
                      <td>{pct(n ?? 0, s.signedUp)}</td>
                      <td>{i === 0 ? "—" : pct(n ?? 0, rows[i - 1]?.[1] ?? 0)}</td>
                      <td className="text-muted">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="section-title">Signups per week (last 8 weeks)</div>
            <div className="card">
              <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "120px" }}>
                {data.weeks.map((w) => (
                  <div key={w.weekEnding} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <span className="mono" style={{ fontSize: "11px", marginBottom: "3px" }}>{w.signedUp}</span>
                    <div style={{ width: "100%", height: `${(w.signedUp / maxWeek) * 90}px`, minHeight: w.signedUp ? "3px" : "1px", background: "var(--amber)", borderRadius: "3px 3px 0 0" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                {data.weeks.map((w) => (
                  <span key={w.weekEnding} className="mono text-muted" style={{ flex: 1, fontSize: "9.5px", textAlign: "center" }}>
                    {new Date(w.weekEnding).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                ))}
              </div>
              <p className="text-muted" style={{ fontSize: "12px", margin: "10px 0 0" }}>Each bar is the 7 days ending on the date shown.</p>
            </div>

            <div className="section-title">Where workers came from</div>
            <div className="card" style={{ overflowX: "auto" }}>
              {data.sources.length === 0 ? (
                <p className="text-muted">No worker signups yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Signed up</th>
                      <th>Approved</th>
                      <th>Approved rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map((src) => (
                      <tr key={src.key}>
                        <td>{src.label}</td>
                        <td>{src.signedUp}</td>
                        <td>{src.approved}</td>
                        <td>{pct(src.approved, src.signedUp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-muted" style={{ fontSize: "12px", margin: "10px 0 0" }}>
                Self-reported at signup (optional). Share links like /signup?src=college to pre-fill the answer. Keys: friend, venue, college, instagram, linkedin, group, other.
              </p>
            </div>

            <p className="text-muted" style={{ fontSize: "12px", marginTop: "14px" }}>
              Current as of {new Date(data.asOf).toLocaleString("en-GB")}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
