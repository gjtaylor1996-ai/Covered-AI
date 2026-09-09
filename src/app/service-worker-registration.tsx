"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a nice-to-have, not a requirement — a
        // failed registration (e.g. unsupported browser) shouldn't be
        // surfaced to the user.
      });
    }
  }, []);
  return null;
}
