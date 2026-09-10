"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Role = "worker" | "venue_admin";

const COPY: Record<
  Role,
  { headline: string; sub: string; formTitle: string; formSub: string; points: [string, string][] }
> = {
  worker: {
    headline: "Every shift, covered.",
    sub: "Join to find shifts that fit your availability, build a real reliability score, and get paid automatically.",
    formTitle: "Apply as a worker",
    formSub: "It's free — venues pay the commission, not you.",
    points: [
      ["◎", "Build a Reliability Score from real shift history — attendance, punctuality, notice given."],
      ["▤", "Set your availability and travel radius — you're never shown shifts outside them."],
      ["£", "Get paid automatically after every completed shift."],
    ],
  },
  venue_admin: {
    headline: "Fill shifts with people you can trust.",
    sub: "Search, filter and book verified hospitality staff by reliability, distance, experience and role.",
    formTitle: "Set up a venue account",
    formSub: "Post your first shift in minutes.",
    points: [
      ["✓", "Every match comes with a plain-language reason, not a black-box ranking."],
      ["📍", "Filter by real distance, not just postcode — see who can actually get there."],
      ["🛡", "Every profile is verified before it's ever shown to you."],
    ],
  },
};

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error === "email_already_registered"
          ? "That email is already registered."
          : "Something went wrong — check your details and try again."
      );
      return;
    }
    router.push("/");
    router.refresh();
  }

  const c = COPY[role];

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
              className={`role-pill ${role === "worker" ? "active" : ""}`}
              onClick={() => setRole("worker")}
            >
              For workers
            </button>
            <button
              type="button"
              className={`role-pill ${role === "venue_admin" ? "active" : ""}`}
              onClick={() => setRole("venue_admin")}
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
              <label>{role === "worker" ? "Full name" : "Venue name"}</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>{role === "worker" ? "Email" : "Work email"}</label>
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
                minLength={8}
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
              {submitting ? "Creating account…" : "Sign up"}
            </button>
          </form>

          <p className="auth-foot-line">
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
