"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "invalid" | "mismatch" | "error">("idle");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setState("mismatch");
      return;
    }
    setState("saving");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (res.ok) setState("done");
    else if (res.status === 400) setState("invalid");
    else setState("error");
  }

  const noToken = token === "";

  return (
    <div className="auth-split">
      <div className="auth-brand-panel">
        <div className="auth-brand-top">
          <BrandMark />
          <span>Covered</span>
        </div>
        <div className="auth-brand-mid">
          <h1 className="auth-headline">Every shift, covered.</h1>
          <p className="auth-headline-sub">Choose a new password for your account.</p>
        </div>
        <div className="auth-brand-foot">Covered · Hospitality staffing</div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-card">
          <h2 className="auth-form-title">Choose a new password</h2>

          {state === "done" ? (
            <>
              <div className="why-box" style={{ marginTop: "8px" }}>Your password has been changed. You can log in with it now.</div>
              <Link href="/login" className="btn primary" style={{ display: "block", textAlign: "center", marginTop: "14px" }}>
                Go to log in
              </Link>
            </>
          ) : noToken || state === "invalid" ? (
            <>
              <div className="error-box">
                <span className="error-icon">⚠</span>
                <span>This reset link is invalid, has already been used, or has expired.</span>
              </div>
              <Link href="/forgot-password" className="btn primary" style={{ display: "block", textAlign: "center", marginTop: "14px" }}>
                Get a new link
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>New password</label>
                <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {state === "mismatch" && (
                <div className="error-box">
                  <span className="error-icon">⚠</span>
                  <span>The two passwords don&apos;t match.</span>
                </div>
              )}
              {state === "error" && (
                <div className="error-box">
                  <span className="error-icon">⚠</span>
                  <span>Something went wrong. Please try again.</span>
                </div>
              )}
              <p className="text-muted" style={{ fontSize: "12px", marginTop: 0 }}>At least 8 characters.</p>
              <button type="submit" className="btn primary" disabled={state === "saving" || token === null} style={{ width: "100%" }}>
                {state === "saving" ? "Saving…" : "Change password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
