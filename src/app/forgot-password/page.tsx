"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "unavailable" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) setState("sent");
    else if (res.status === 503) setState("unavailable");
    else setState("error");
  }

  return (
    <div className="auth-split">
      <div className="auth-brand-panel">
        <div className="auth-brand-top">
          <BrandMark />
          <span>Covered</span>
        </div>
        <div className="auth-brand-mid">
          <h1 className="auth-headline">Every shift, covered.</h1>
          <p className="auth-headline-sub">Forgotten your password? It happens. We&apos;ll email you a link to choose a new one.</p>
        </div>
        <div className="auth-brand-foot">Covered · Hospitality staffing</div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-card">
          <h2 className="auth-form-title">Reset your password</h2>
          <p className="auth-form-sub">Works for workers and venues. Enter the email you signed up with.</p>

          {state === "sent" ? (
            <div className="why-box" style={{ marginTop: "8px" }}>
              If there&apos;s an account for <strong>{email}</strong>, we&apos;ve emailed a link to reset the password. It
              works once and expires in an hour. Check your spam folder if it doesn&apos;t arrive.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {state === "unavailable" && (
                <div className="error-box">
                  <span className="error-icon">⚠</span>
                  <span>Password reset by email isn&apos;t switched on yet. Please contact us and we&apos;ll reset it for you.</span>
                </div>
              )}
              {state === "error" && (
                <div className="error-box">
                  <span className="error-icon">⚠</span>
                  <span>Something went wrong. Check the email address and try again.</span>
                </div>
              )}
              <button type="submit" className="btn primary" disabled={state === "sending"} style={{ width: "100%" }}>
                {state === "sending" ? "Sending…" : "Email me a reset link"}
              </button>
            </form>
          )}

          <p className="auth-foot-line">
            Remembered it? <Link href="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
