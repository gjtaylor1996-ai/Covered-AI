"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Shift offers expire after a fixed response window (see
 * RESPOND_WINDOW_HOURS in the offer API route) — a worker who isn't
 * looking at the app when one lands can miss it entirely. Not in the
 * spec; the one native-feeling touch this app has, since the Capacitor
 * wrapper otherwise just loads the website.
 */
export function PushNotificationsToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub);
    });
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications are blocked — enable them in your browser's site settings.");
        return;
      }
      const keyRes = await fetch("/api/push/vapid-public-key");
      if (!keyRes.ok) {
        setError("Push notifications aren't set up yet.");
        return;
      }
      const { publicKey } = await keyRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const subJson = sub.toJSON();
      const res = await fetch("/api/workers/me/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      if (!res.ok) {
        setError("Could not save your subscription.");
        return;
      }
      setEnabled(true);
    } catch {
      setError("Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/workers/me/push-subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
    } catch {
      setError("Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  if (enabled) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
        <span className="badge confirmed" style={{ marginTop: 0 }}>🔔 shift offer alerts on</span>
        <button className="btn ghost" disabled={busy} onClick={disable} style={{ fontSize: "10px", padding: "5px 10px" }}>
          Turn off
        </button>
        {error && <p className="mono text-error" style={{ fontSize: "12px", margin: 0 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="connect-nudge">
      <div className="connect-nudge-icon">🔔</div>
      <div className="connect-nudge-copy">
        <div className="title">Get notified about shift offers</div>
        <p>Offers expire after 2 hours — a push notification means you won&apos;t miss one.</p>
      </div>
      <button className="btn primary" disabled={busy} onClick={enable}>
        {busy ? "Enabling…" : "Turn on"}
      </button>
      {error && <p className="mono text-error" style={{ fontSize: "12px", width: "100%", marginTop: "8px" }}>{error}</p>}
    </div>
  );
}
