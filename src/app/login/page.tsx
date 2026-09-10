"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type AudienceKey = "worker" | "venue";

const COPY: Record<
  AudienceKey,
  { headline: string; sub: string; formTitle: string; formSub: string; points: [string, string][] }
> = {
  worker: {
    headline: "Every shift, covered.",
    sub: "Sign in to manage your shifts, your reliability score, and where you're available to work.",
    formTitle: "Welcome back",
    formSub: "Log in to see your shifts, availability and reliability score.",
    points: [
      ["◎", "See your full Reliability Score breakdown, not just the headline number."],
      ["▤", "Set your availability and travel radius — you're never shown shifts outside them."],
      ["£", "Get paid automatically after every completed shift."],
    ],
  },
  venue: {
    headline: "Fill shifts with people you can trust.",
    sub: "Sign in to search, filter and book verified hospitality staff by reliability, distance, experience and role.",
    formTitle: "Venue login",
    formSub: "Log in to search candidates and manage your bookings.",
    points: [
      ["✓", "Every match comes with a plain-language reason, not a black-box ranking."],
      ["📍", "Filter by real distance, not just postcode — see who can actually get there."],
      ["🛡", "Every profile is verified before it's ever shown to you."],
    ],
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [audience, setAudience] = useState<AudienceKey>("worker");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

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
          <h2 className="auth-form-title">{c.formTitle}</h2>
          <p className="auth-form-sub">{c.formSub}</p>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>{audience === "venue" ? "Work email" : "Email"}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="error-box">
                <span className="error-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}
            <button type="submit" className="btn primary" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="auth-foot-line">
            New to Covered? <Link href="/signup">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
