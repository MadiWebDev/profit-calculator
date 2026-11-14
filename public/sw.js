// GetProfitCalc Service Worker
// Provides offline support for cached dashboard views

// NOTE: v2 — the v1 worker intercepted EVERY `.js` request, including the
// cross-origin Paddle checkout script (cdn.paddle.com), and broke it:
// the worker's cache-first handling failed the subresource load with
// net::ERR_FAILED, so Paddle.js never loaded and every Subscribe click
// failed with "Checkout couldn't load". The worker now only ever touches
// same-origin requests. Third-party scripts (Paddle, analytics, ads)
// are fetched by the browser directly, exactly as if no worker existed.
const CACHE_NAME = "getprofitcalc-v2";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/manifest.json",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Navigation requests: network-first, fall back to /dashboard cache
// - API requests: network-only (never cache sensitive data)
// - Static assets: cache-first
// - Anything cross-origin: never intercepted (let the browser fetch it)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and API requests
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Never intercept third-party requests. A service worker must not sit
  // between the page and another origin's script: cross-origin responses
  // are opaque (status 0, ok false), so the cache-first logic below
  // cannot cache them — and when the worker's handling of such a request
  // fails, the browser fails the subresource load outright
  // (net::ERR_FAILED) instead of falling back to the network. That is
  // what broke Paddle.js: the worker intercepted
  // cdn.paddle.com/paddle/v2/paddle.js and the load failed.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation: network-first
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // Cache successful navigation responses
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) => cached || caches.match("/dashboard")
          )
        )
    );
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js")
  ) {
    event.respondWith(
      caches.match(event.request)
        .then(
          (cached) =>
            cached ||
            fetch(event.request).then((res) => {
              if (res.ok) {
                // Clone SYNCHRONOUSLY, before returning the response.
                // The v1 code cloned inside the deferred caches.open().then(),
                // by which time the page had already started consuming the
                // body — "Failed to execute 'clone' on 'Response':
                // Response body is already used" (sw.js:72).
                const clone = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
              }
              return res;
            })
        )
        // If the cache lookup or the network fetch fails, fall back to a
        // plain network fetch instead of failing the subresource: a worker
        // must never be the reason a script or stylesheet fails to load.
        .catch(() => fetch(event.request))
    );
    return;
  }
});

// Background sync for deferred actions (future use)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-data") {
    // Placeholder for background data sync
    console.log("[SW] Background sync triggered");
  }
});
