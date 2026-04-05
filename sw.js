/* ════════════════════════════════════════════════════════
   FuelMap Service Worker — v2.0
   Stratégies :
     • Static assets (HTML, fonts, Leaflet) → Cache-First
     • API calls (data.economie, geo.api)  → Network-First + Cache Fallback
     • Offline fallback                    → /offline.html
════════════════════════════════════════════════════════ */

const APP_VERSION   = 'v2.0';
const STATIC_CACHE  = `fuelmap-static-${APP_VERSION}`;
const DATA_CACHE    = `fuelmap-data-${APP_VERSION}`;
const OFFLINE_URL   = '/offline.html';

/* Assets à pré-cacher à l'installation */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

/* Domaines API dont les réponses doivent être mises en cache */
const API_DOMAINS = [
  'data.economie.gouv.fr',
  'geo.api.gouv.fr',
];

/* Domaines statiques externes (fonts, tiles) → cache-first */
const STATIC_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

/* ─── INSTALL ─────────────────────────────────────────── */
self.addEventListener('install', event => {
  console.log('[SW] Install', APP_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache error:', err))
  );
});

/* ─── ACTIVATE ────────────────────────────────────────── */
self.addEventListener('activate', event => {
  console.log('[SW] Activate', APP_VERSION);
  event.waitUntil(
    Promise.all([
      // Purge old caches from previous versions
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
            .map(k => {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
        )
      ),
      // Claim all open clients immediately
      self.clients.claim(),
    ])
  );
});

/* ─── FETCH ───────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip browser extensions and chrome-extension://
  if (!url.protocol.startsWith('http')) return;

  // API calls → Network-First with cache fallback
  if (API_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    return;
  }

  // Font / external static → Cache-First with network fallback
  if (STATIC_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE));
    return;
  }

  // Tile layers → Cache-First (tiles rarely change)
  if (url.hostname.includes('cartocdn.com') || url.hostname.includes('openstreetmap.org')) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE));
    return;
  }

  // App shell (local files) → Cache-First, fallback to network then offline page
  event.respondWith(appShellStrategy(request));
});

/* ════════════════════════════════════════════════════════
   STRATEGIES
════════════════════════════════════════════════════════ */

/**
 * Network-First: Try network, cache on success, return cached on failure.
 * Best for API data that should be fresh but still work offline.
 */
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      // Cache a clone of the response
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.log('[SW] Network failed, serving from cache:', request.url);
    const cached = await cache.match(request);
    if (cached) return cached;
    // Return a JSON error response so the app can handle it gracefully
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Aucune donnée en cache.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Cache-First: Return from cache if available, else fetch and cache.
 * Best for static assets that don't change often.
 */
async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const cache    = await caches.open(cacheName);
    const response = await fetch(request.clone());
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'Network unavailable' });
  }
}

/**
 * App Shell: Cache-First for local HTML/JS/CSS, offline page as last resort.
 */
async function appShellStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const cache    = await caches.open(STATIC_CACHE);
    const response = await fetch(request.clone());
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // For navigation requests, return the offline page
    if (request.destination === 'document') {
      const offlinePage = await caches.match(OFFLINE_URL);
      return offlinePage || new Response('<h1>Hors-ligne</h1>', {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    return new Response('', { status: 504 });
  }
}

/* ─── PUSH NOTIFICATIONS (placeholder) ───────────────── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'FuelMap', {
      body:  data.body  || 'Mise à jour des prix disponible.',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag:   'fuelmap-update',
      renotify: false,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const existing = windowClients.find(c => c.url === url);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
  );
});

/* ─── BACKGROUND SYNC (placeholder) ──────────────────── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-prices') {
    console.log('[SW] Background sync: refreshing prices');
    // Background sync would refresh cached station data here
  }
});

/* ─── PERIODIC BACKGROUND SYNC ───────────────────────── */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'refresh-prices') {
    console.log('[SW] Periodic sync: refreshing price cache');
  }
});
