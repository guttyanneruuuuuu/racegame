// =============================================================================
// GyroRush Service Worker - offline PWA support
// =============================================================================
// Strategy: cache-first for static assets (vendor + js + css + html), with a
// network-first fallback for the document. Versioned cache so changes invalidate
// old entries automatically.
//
// Lightweight: caches only what is in PRECACHE; nothing oversized.
// =============================================================================

const VERSION = 'gyrorush-v3';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.png',
  './css/style.css',
  './vendor/three.min.js',
  './vendor/peerjs.min.js',
  './js/utils.js',
  './js/input.js',
  './js/sfx.js',
  './js/track_grand.js',
  './js/track_volcano.js',
  './js/track.js',
  './js/car.js',
  './js/items.js',
  './js/ai.js',
  './js/network.js',
  './js/game.js',
  './js/ui.js',
  './js/bgm.js',
  './js/fx.js',
  './js/awards.js',
  './js/items_ext.js',
  './js/ai_ext.js',
  './js/camera_ext.js',
  './js/net_ext.js',
  './js/game_ext.js',
  './js/ui_ext.js',
  './js/online_ext.js',
  './js/party_ext.js',
  './js/main.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Skip cross-origin (e.g. peerjs server, analytics) — never cache, let it pass-through
  if (url.origin !== location.origin) return;

  // Network-first for HTML navigations so users get latest content when online
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then((resp) => {
        // Update cache for index
        const copy = resp.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // Cache same-origin successful responses opportunistically
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      });
    })
  );
});
