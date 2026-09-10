"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"worker" | "venue_admin">("worker");
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

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand-mark">Co</div>
        <h1 style={{ fontSize: "22px", marginBottom: "16px" }}>Sign up</h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>I am a…</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="worker">Worker</option>
              <option value="venue_admin">Venue</option>
            </select>
          </div>
          <div className="field">
            <label>{role === "worker" ? "Full name" : "Venue name"}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Email</label>
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
          {error && <p className="mono text-error" style={{ fontSize: "12.5px" }}>{error}</p>}
          <button type="submit" className="btn primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p style={{ fontSize: "12.5px", marginTop: "14px" }}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
