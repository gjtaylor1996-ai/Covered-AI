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
