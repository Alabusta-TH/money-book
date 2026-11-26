// Service worker: keeps a copy of the app on the iPad so it opens without internet.
// build.ps1 replaces 20261126215304 on every build so the iPad picks up new versions.
const VERSION = "20261126215304";
const CACHE = "money-book-" + VERSION;
const FILES = [
  "./",
  "index.html",
  "kaopun.html",
  "nampun.html",
  "game.html",
  "manifest-kaopun.json",
  "manifest-nampun.json",
  "icons/kaopun-180.png",
  "icons/kaopun-192.png",
  "icons/kaopun-512.png",
  "icons/nampun-180.png",
  "icons/nampun-192.png",
  "icons/nampun-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("money-book-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Show the saved copy right away; refresh it from the internet in the background when online.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        const fromNet = fetch(req)
          .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || fromNet;
      })
    )
  );
});
