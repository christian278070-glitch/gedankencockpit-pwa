const CACHE_NAME = 'cockpit-cache-v4';
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
      // Einzelnes Caching: Schlägt eine Datei fehl, bricht nicht die gesamte PWA ab
      return Promise.allSettled(
        urlsToCache.map(file => 
          cache.add(file).catch(err => console.warn(`SW Cache Fehler bei ${file}:`, err))
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

// 3. DATENABRUF: "Network-First" (Immer die aktuellste Version laden)
self.addEventListener('fetch', event => {
  // Nur GET-Requests cachen; Google Apps Script Web-App NIEMALS cachen
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
    return;
  }

  // Erst Netzwerk versuchen, bei Offline-Zustand auf Cache zurückgreifen
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Nur valide 200er Basis-Antworten in den Cache klonen
        if (response && response.status === 200 && response.type === 'basic') {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        }
        return response;
      })
      .catch(() => {
        // ignoreSearch: true stellt sicher, dass z.B. '?v=...' oder Tokens gecachte Dateien nicht verfehlen
        return caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
          return cachedResponse || caches.match('./index.html', { ignoreSearch: true });
        });
      })
  );
});
