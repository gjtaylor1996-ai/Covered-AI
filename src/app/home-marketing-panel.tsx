"use client";

import { useState } from "react";
import Link from "next/link";

type AudienceKey = "worker" | "venue";

const COPY: Record<AudienceKey, { headline: string; sub: string; points: [string, string][] }> = {
  worker: {
    headline: "Every shift, covered.",
    sub: "Find shifts that fit your availability, build a real reliability score, and get paid automatically.",
    points: [
      ["◎", "Build a Reliability Score from real shift history — attendance, punctuality, notice given."],
      ["▤", "Set your availability and travel radius — you're never shown shifts outside them."],
      ["£", "Get paid automatically after every completed shift."],
    ],
  },
  venue: {
    headline: "Fill shifts with people you can trust.",
    sub: "Search, filter and book verified hospitality staff by reliability, distance, experience and role.",
    points: [
      ["✓", "Every match comes with a plain-language reason, not a black-box ranking."],
      ["📍", "Filter by real distance, not just postcode — see who can actually get there."],
      ["🛡", "Every profile is verified before it's ever shown to you."],
    ],
  },
};

export function HomeMarketingPanel() {
  const [audience, setAudience] = useState<AudienceKey>("worker");
  const c = COPY[audience];

  return (
    <div className="auth-split">
      <div className="auth-brand-panel">
        <div className="auth-brand-top">
          <div className="brand-mark">Co</div>
          <span>Covered</span>
        </div>

        <div className="auth-brand-mid">
          <div className="role-pill-row">
            <button
              type="button"
              className={`role-pill ${audience === "worker" ? "active" : ""}`}
              onClick={() => setAudience("worker")}
            >
              For workers
            </button>
            <button
              type="button"
              className={`role-pill ${audience === "venue" ? "active" : ""}`}
              onClick={() => setAudience("venue")}
            >
              For venues
            </button>
          </div>
          <h1 className="auth-headline">{c.headline}</h1>
          <p className="auth-headline-sub">{c.sub}</p>

          <div className="auth-points">
            {c.points.map(([icon, text]) => (
              <div className="auth-point" key={text}>
                <div className="auth-point-dot">{icon}</div>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-brand-foot">Covered · Hospitality staffing</div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-card">
          <h2 className="auth-form-title">Get started</h2>
          <p className="auth-form-sub">
            {audience === "worker"
              ? "It's free — venues pay the commission, not you."
              : "Post your first shift in minutes."}
          </p>

          <Link
            href="/signup"
            className="btn primary"
            style={{ width: "100%", display: "block", textAlign: "center", marginBottom: "10px" }}
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="btn ghost"
            style={{ width: "100%", display: "block", textAlign: "center" }}
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
