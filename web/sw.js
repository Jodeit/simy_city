/* SIMyCity app-shell service worker.
   Cache-first for the static, same-origin files listed in SHELL_ASSETS
   below (everything the app needs to boot and run offline once visited:
   the two pages, the shared logic/model bundles, vendored Leaflet, the
   manifest and icons). Cross-origin requests (map tiles, Overpass, ArcGIS,
   Census, USGS, Nominatim) are never intercepted here — those are live
   data, not app shell, so they always go straight to the network.

   CACHE_NAME is versioned; bump it on any app-shell asset change so a
   repeat visitor picks up the new files instead of a stale cached shell.
   The activate step deletes every previously-named cache. */
const CACHE_NAME="simy-shell-v1";
const SHELL_ASSETS=[
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
  "icons/apple-touch-icon.png"
];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL_ASSETS)).catch(()=>{}));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(names=>Promise.all(names.filter(n=>n!==CACHE_NAME).map(n=>caches.delete(n))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return; // cross-origin: never intercept, network-only

  const path=url.pathname.replace(/^.*\/web\//,"").replace(/^\/+/,"") || "explore.html";
  if(!SHELL_ASSETS.includes(path)) return; // not part of the app shell: default network handling

  event.respondWith(
    caches.match(req).then(cached=>cached || fetch(req).then(res=>{
      const copy=res.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)).catch(()=>{});
      return res;
    }))
  );
});
