/* ════════════════════════════════════════════════════════
   GeoCarbu Service Worker — v2.0
   Stratégies :
     • Static assets (HTML, fonts, Leaflet) → Cache-First
     • API calls (data.economie, geo.api)   → Network-First + Cache Fallback
     • Offline fallback                     → /offline.html
════════════════════════════════════════════════════════ */

const APP_VERSION  = 'v2.0';
const STATIC_CACHE = `GeoCarbu-static-${APP_VERSION}`;
const DATA_CACHE   = `GeoCarbu-data-${APP_VERSION}`;
const OFFLINE_URL  = '/offline.html';

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
  console.log('[GeoCarbu SW] Install', APP_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(
        STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' }))
      ))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[GeoCarbu SW] Erreur pré-cache :', err))
  );
});

/* ─── ACTIVATE ────────────────────────────────────────── */
self.addEventListener('activate', event => {
  console.log('[GeoCarbu SW] Activate', APP_VERSION);
  event.waitUntil(
    Promise.all([
      /* Suppression des anciens caches des versions précédentes */
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
            .map(k => {
              console.log('[GeoCarbu SW] Suppression ancien cache :', k);
              return caches.delete(k);
            })
        )
      ),
      /* Prise en charge immédiate de tous les clients ouverts */
      self.clients.claim(),
    ])
  );
});

/* ─── FETCH ───────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Ignorer les requêtes non-GET */
  if (request.method !== 'GET') return;

  /* Ignorer les extensions navigateur (chrome-extension://, etc.) */
  if (!url.protocol.startsWith('http')) return;

  /* API carburants / géolocalisation → Network-First + cache fallback */
  if (API_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    return;
  }

  /* Fonts / assets externes → Cache-First + fallback réseau */
  if (STATIC_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE));
    return;
  }

  /* Tuiles carte → Cache-First (les tuiles changent rarement) */
  if (
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('openstreetmap.org')
  ) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE));
    return;
  }

  /* App shell (fichiers locaux) → Cache-First, page offline en dernier recours */
  event.respondWith(appShellStrategy(request));
});

/* ════════════════════════════════════════════════════════
   STRATÉGIES
════════════════════════════════════════════════════════ */

/**
 * Network-First : réseau en priorité, mise en cache au succès,
 * retour sur le cache en cas d'échec.
 * Idéal pour les données API fraîches mais utilisables hors-ligne.
 */
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    console.log('[GeoCarbu SW] Réseau indisponible, cache utilisé :', request.url);
    const cached = await cache.match(request);
    if (cached) return cached;
    /* Réponse JSON d'erreur pour que l'app puisse la gérer proprement */
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Aucune donnée en cache.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Cache-First : retourne depuis le cache si disponible,
 * sinon récupère depuis le réseau et met en cache.
 * Idéal pour les assets statiques qui changent peu.
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
    return new Response('', { status: 504, statusText: 'Réseau indisponible' });
  }
}

/**
 * App Shell : Cache-First pour les fichiers locaux HTML/JS/CSS,
 * page offline intégrée en dernier recours.
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
    if (request.destination === 'document') {
      const offlinePage = await caches.match(OFFLINE_URL);
      return offlinePage || new Response(
        `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GeoCarbu — Hors-ligne</title>
  <style>
    body { font-family: Figtree, sans-serif; background: #07090f; color: #e8eef8;
           display: flex; align-items: center; justify-content: center;
           height: 100dvh; margin: 0; text-align: center; padding: 24px; }
    h1   { font-size: 2rem; margin-bottom: .5rem; }
    p    { color: #7a99bb; }
    span { font-size: 3rem; display: block; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div>
    <span>⛽</span>
    <h1>GeoCarbu</h1>
    <p>Vous êtes hors-ligne.<br>Vérifiez votre connexion et réessayez.</p>
  </div>
</body>
</html>`,
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    return new Response('', { status: 504 });
  }
}

/* ─── PUSH NOTIFICATIONS ──────────────────────────────── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'GeoCarbu', {
      body:     data.body || 'Mise à jour des prix disponible.',
      icon:     '/icons/icon-192.png',
      badge:    '/icons/icon-96.png',
      tag:      'GeoCarbu-update',
      renotify: false,
      data:     { url: data.url || '/' },
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

/* ─── BACKGROUND SYNC ─────────────────────────────────── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-prices') {
    console.log('[GeoCarbu SW] Background sync : rafraîchissement des prix');
    /* Ici : logique de rafraîchissement des données stations en arrière-plan */
  }
});

/* ─── PERIODIC BACKGROUND SYNC ───────────────────────── */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'refresh-prices') {
    console.log('[GeoCarbu SW] Periodic sync : mise à jour du cache prix');
  }
});
