// Service worker: keeps a copy of the app on the iPad so it opens without internet.
// build.ps1 replaces 20261127135300 on every build so the iPad picks up new versions.
//   - pages (html): try the internet first (waits up to 4 seconds), use the saved copy when offline
//   - icons and other files: use the saved copy, refresh it in the background
const VERSION = "20261127135300";
const CACHE = "money-book-" + VERSION;
const PAGE_TIMEOUT_MS = 4000;
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

// the address without ?... so every copy of a page is saved under one name
function keyOf(url) {
  const u = new URL(url, self.location.href);
  u.search = "";
  u.hash = "";
  return u.href;
}

// always ask the server (skip the browser's short-term memory) so we never save an old file
function fetchFresh(url) {
  return fetch(url, { cache: "no-cache", credentials: "same-origin" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(FILES.map((f) =>
        fetch(new Request(f, { cache: "reload" })).then((res) => {
          if (!res.ok) throw new Error("download failed: " + f);
          return cache.put(keyOf(f), res);
        })
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  let updated = false;
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter((k) => k.startsWith("money-book-") && k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    updated = old.length > 0;
  })().then(() => {
    // this is an update: reload pages that are still showing the old version.
    // not awaited on purpose - the reload can only start after activation has finished
    if (!updated) return;
    self.clients.matchAll({ type: "window" }).then((wins) => {
      wins.forEach((w) => { if (w.navigate) w.navigate(w.url).catch(() => {}); });
    });
  }));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const key = keyOf(req.url);
  const isPage = req.mode === "navigate" || req.destination === "document" || key.endsWith(".html") || key.endsWith("/");

  if (isPage) {
    // internet first, saved copy when offline or too slow
    const fromNet = fetchFresh(key).then(async (res) => {
      if (res.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(key, res.clone());
      }
      return res;
    });
    event.waitUntil(fromNet.catch(() => {}));
    event.respondWith((async () => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS));
      const net = await Promise.race([fromNet.catch(() => null), timeout]);
      if (net && net.ok) return net;
      const hit = await caches.match(key);
      if (hit) return hit;
      return net || fromNet;
    })());
    return;
  }

  // other files: saved copy right away, refresh in the background
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    const fromNet = fetchFresh(key).then((res) => {
      if (res.ok) return cache.put(key, res.clone()).then(() => res);
      return res;
    });
    event.waitUntil(fromNet.catch(() => {}));
    if (hit) return hit;
    return fromNet;
  })());
});
