// Minimal service worker — enables PWA install. Network-first for the app
// shell; deliberately does NOT cache photos or any Supabase responses (private
// signed URLs must not be persisted).
const SHELL = "mirror-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(["/", "/login"]).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never touch cross-origin (Supabase) or non-GET requests.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => res)
      .catch(() => caches.match(event.request).then((c) => c || Response.error())),
  );
});
