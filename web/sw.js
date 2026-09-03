/* SIMyCity app-shell service worker.
   Cache-first for the static, same-origin app shell only; everything
   cross-origin (map tiles, Overpass, ArcGIS, Census, USGS, Nominatim) is
   live data and must never be intercepted here.
   Bump CACHE_NAME on any deploy that changes one of the ASSETS files below
   so repeat visits pick up the new versions instead of a stale shell. */
const CACHE_NAME = "simy-shell-v1";
const ASSETS = [
  "explore.html",
  "index.html",
  "logic.js",
  "model.js",
  "model.json",
  "manifest.json",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/images/marker-icon.png",
  "vendor/leaflet/images/marker-icon-2x.png",
  "vendor/leaflet/images/marker-shadow.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: never intercept live data
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
