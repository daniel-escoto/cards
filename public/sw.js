/* Minimal app-shell cache for offline bot-only Host. Online multiplayer still needs network. */
const CACHE_NAME = "cards-shell-v5";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/practice.js",
  "/raise-sizing.js",
  "/card-art.js",
  "/manifest.webmanifest",
  "/shared/pokersolver.js",
  "/shared/engine.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache Socket.IO realtime endpoints.
  if (url.pathname.startsWith("/socket.io/")) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      // Stale-while-revalidate for shell assets when online.
      event.waitUntil(
        fetch(request).then((response) => {
          if (response && response.ok) {
            return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return undefined;
        }).catch(() => undefined),
      );
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response && response.ok && shouldCache(url.pathname)) {
        const copy = response.clone();
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, copy);
      }
      return response;
    } catch (error) {
      if (request.mode === "navigate") {
        const fallback = await caches.match("/index.html");
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});

function shouldCache(pathname) {
  return APP_SHELL.includes(pathname)
    || pathname.startsWith("/shared/")
    || pathname === "/manifest.webmanifest";
}
