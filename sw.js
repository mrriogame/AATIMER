/**
 * AATIMER Service Worker
 *
 * Strategy (GitHub Pages, no backend):
 * - HTML, JS, CSS, JSON  → network-first, cache fallback (offline)
 * - icons / other static → stale-while-revalidate
 *
 * On activate: drop every cache except CACHE_NAME, then clients.claim().
 * On install: precache shell + skipWaiting() so updates apply quickly.
 *
 * Bump CACHE_NAME on every release that changes app files.
 */
const CACHE_NAME = "aatimer-cache-v5";

const PRECACHE = [
  "./",
  "./index.html",
  "./tasks.html",
  "./css/app.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/timers.js",
  "./js/tasks-page.js",
  "./js/add-task-modal.js",
  "./js/quests.js",
  "./js/sw-register.js",
  "./data/events.json",
  "./data/dailies.json",
  "./data/weeklies.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (res.ok) await cache.put(url, res);
          } catch {
            /* offline / missing — skip */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

function isCriticalAsset(url) {
  const path = url.pathname;
  return (
    path.endsWith(".html") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".json") ||
    path.endsWith(".webmanifest") ||
    path.endsWith("/") ||
    /\/(index|tasks)(\.html)?$/i.test(path)
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request, { cache: "no-cache" });
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isNavigationRequest(request)) {
      return (
        (await cache.match("./index.html")) ||
        (await cache.match("./")) ||
        Response.error()
      );
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await networkPromise) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/sw.js")) return;

  if (isNavigationRequest(request) || isCriticalAsset(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
