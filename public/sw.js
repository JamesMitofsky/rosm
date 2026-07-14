/*
 * Fountain Mapper service worker — hand-rolled (no build step) so it stays compatible
 * with Next 16 + Turbopack. Strategy per request class:
 *   - mutations / OSM write / auth         -> network only (never cache)
 *   - map basemap tiles                    -> cache-first + LRU cap
 *   - navigations (HTML)                   -> network-first, fall back to cache, then offline page
 *   - same-origin build assets / icons     -> stale-while-revalidate
 *   - other cross-origin GETs (fonts, etc) -> stale-while-revalidate
 */

const VERSION = "rosm-24ec452";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const TILE_CACHE = `${VERSION}-tiles`;
const TILE_MAX = 2000;

const OFFLINE_URL = "/~offline";
// Core shell warmed at install so first offline launch still renders.
const SHELL_URLS = [
  "/",
  "/plan",
  "/run",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort: a single 404 must not abort the whole install.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, TILE_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Let the page trigger an immediate update (used by the registrar on new SW).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isTile(url) {
  return url.hostname.endsWith("tile.openstreetmap.org");
}

// Requests that must always hit the network and never be served from cache.
function isNeverCache(request, url) {
  if (request.method !== "GET") return true;
  return (
    url.pathname.startsWith("/api/osm/") ||
    url.pathname.startsWith("/api/run") ||
    url.pathname.startsWith("/api/draft")
  );
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // FIFO eviction — oldest inserted entries first.
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName, { trimTo } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) {
    await cache.put(request, res.clone());
    if (trimTo) trimCache(cacheName, trimTo);
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || (await network) || Response.error();
}

async function navigate(request) {
  try {
    // Prefer fresh HTML; falls through to cache when offline.
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = (await cache.match(request)) || (await cache.match("/"));
    return cached || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isNeverCache(request, url)) return; // default network handling

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  if (isTile(url)) {
    event.respondWith(cacheFirst(request, TILE_CACHE, { trimTo: TILE_MAX }));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // Cross-origin GETs (fonts, routing/overpass reads) — best-effort cache.
  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});
