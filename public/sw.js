// Minimal service worker — exists to satisfy installability criteria
// (Chrome/Android requires a registered SW with a fetch handler), not
// to provide full offline support. Network-first, no caching: this is
// a data-driven marketplace app, stale cached responses would be worse
// than no offline support at all.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// Shift-offer push notifications — see src/lib/push.ts for what sends
// these and src/app/worker/push-notifications-toggle.tsx for how a
// worker opts in. Payload is JSON: { title, body, url }.
self.addEventListener("push", (event) => {
  let payload = { title: "Covered", body: "You have a new notification.", url: "/worker/shifts" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/worker/shifts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
