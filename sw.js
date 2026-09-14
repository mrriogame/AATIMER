/* Cache shell + schedule for offline open. Alarms still need an open page to fire. */
const CACHE = "timer-site-v4";
const ASSETS = [
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
  "./data/events.json",
  "./data/dailies.json",
  "./data/weeklies.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response && response.ok && request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
