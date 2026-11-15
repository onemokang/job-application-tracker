/* Network-first service worker: always tries the live site, falls back to cache offline.
   Only same-origin GET requests are handled (GitHub API sync calls are never touched). */
const CACHE = "jobhunt-v1";
const CORE = ["./", "index.html", "styles.css", "app.js", "scenery.js", "sync.js", "config.js",
  "data.json", "schools.json", "roadmap.json", "updates.json", "status.json", "progress.json", "manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match("index.html")))
  );
});
