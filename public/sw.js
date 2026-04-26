// Tile Studio service worker — precaches the SPA shell and serves it offline.
// Strategy: cache-first for navigation requests (so the home-screen install boots
// without network), network-first for everything else (so JS/CSS bundles get the
// freshest version when online; offline falls back to whatever was cached).
//
// Bumping CACHE_VERSION invalidates all caches and forces a re-precache on next visit.
// vite-plugin-pwa would do this automatically, but we ship a small hand-rolled worker
// to avoid pulling in a build dep just for offline boot.

const CACHE_VERSION = 'tilestudio-v1';
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET — POST/PUT etc. should never hit the cache.
  if (req.method !== 'GET') return;
  // Ignore cross-origin requests (we don't proxy them).
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: cache-first (boot from cache when offline). Always serves index.html
  // since the SPA handles its own routing client-side.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) =>
        cached || fetch(req).catch(() => caches.match('/index.html') || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Other GETs: network-first, fall back to cache, populate cache on success.
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((cached) => cached || new Response('Offline', { status: 503 })))
  );
});
