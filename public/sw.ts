/* Minimal app-shell cache for offline bot-only Host. Online multiplayer still needs network. */
/* CACHE_VERSION is replaced by the server with the deploy build id when served. */

/** Local SW typing — avoid `export {}` / webworker lib so emit stays a classic worker script. */
type SwScope = {
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
  addEventListener(
    type: "install" | "activate" | "fetch" | string,
    listener: (event: SwExtendableEvent & SwFetchEvent) => void,
  ): void;
};

type SwExtendableEvent = Event & {
  waitUntil(promise: Promise<unknown>): void;
};

type SwFetchEvent = SwExtendableEvent & {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
};

function isSwScope(value: unknown): value is SwScope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    skipWaiting?: unknown;
    clients?: unknown;
    location?: unknown;
    addEventListener?: unknown;
  };
  if (typeof candidate.skipWaiting !== "function") return false;
  if (typeof candidate.addEventListener !== "function") return false;
  if (typeof candidate.clients !== "object" || candidate.clients === null) return false;
  if (typeof (candidate.clients as { claim?: unknown }).claim !== "function") return false;
  if (typeof candidate.location !== "object" || candidate.location === null) return false;
  if (typeof (candidate.location as { origin?: unknown }).origin !== "string") return false;
  return true;
}

const swSelf: unknown = self;
if (!isSwScope(swSelf)) {
  throw new Error("Service worker global scope unavailable");
}
const sw = swSelf;

const CACHE_VERSION = "__BUILD_ID__";
/** Bump when the app-shell file set changes so clients drop stale precaches. */
const SHELL_REVISION = "3";
const CACHE_NAME = `holdem-nyc-shell-${CACHE_VERSION}-${SHELL_REVISION}`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app-sounds.js",
  "/app-format.js",
  "/app-keybinds.js",
  "/app-boot.js",
  "/app-table.js",
  "/app-events.js",
  "/practice.js",
  "/deploy-handoff.js",
  "/raise-sizing.js",
  "/card-art.js",
  "/turn-clock-warning.js",
  "/ready-clock.js",
  "/invite-url.js",
  "/manifest.webmanifest",
  "/shared/pokersolver.js",
  "/shared/engine.js",
];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  // Never cache Socket.IO realtime endpoints.
  if (url.pathname.startsWith("/socket.io/")) return;
  // Always network for the service worker script so deploys activate cleanly.
  if (url.pathname === "/sw.js") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        // Stale-while-revalidate for shell assets when online.
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                return caches
                  .open(CACHE_NAME)
                  .then((cache) => cache.put(request, response.clone()));
              }
              return undefined;
            })
            .catch(() => undefined),
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
    })(),
  );
});

function shouldCache(pathname: string) {
  return (
    APP_SHELL.includes(pathname) ||
    pathname.startsWith("/shared/") ||
    pathname === "/manifest.webmanifest"
  );
}
