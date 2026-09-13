const CACHE_NAME = 'cockpit-cache-v3';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// 1. INSTALLIEREN & SOFORT ÜBERNEHMEN
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Einzelnes Caching statt all-or-nothing, um Blockaden bei fehlenden Dateien zu vermeiden
      return Promise.allSettled(
        urlsToCache.map(file => 
          cache.add(file).catch(err => console.error(`SW Cache Fehler bei ${file}:`, err))
        )
      );
    })
  );
});

// 2. AUFRÄUMEN (Löscht alte Caches)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Lösche alten Cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Übernimmt sofort die Kontrolle
  );
});

// 3. DATENABRUF: "Network-First" (Immer die aktuellste Version laden!)
self.addEventListener('fetch', event => {
  // Google Script API-Aufrufe NIEMALS cachen
  if (event.request.method === 'POST' || event.request.url.includes('script.google.com')) {
    return; 
  }

  // Für App-Dateien: Erst GitHub fragen, falls offline -> Cache nutzen
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache im Hintergrund mit der frischen Version aktualisieren
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => {
        // ignoreSearch behebt das Kaltstart-Problem mit URL-Parametern (z.B. app.js?v=2)
        return caches.match(event.request, { ignoreSearch: true }).then(response => {
          // Fallback auf index.html, falls die spezifische Datei nicht im Cache ist
          return response || caches.match('./index.html');
        });
      })
  );
});
