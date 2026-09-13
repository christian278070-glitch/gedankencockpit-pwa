const CACHE_NAME = 'cockpit-cache-v2';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // POST-Requests (Verschieben) oder API-Abrufe (script.google.com) nicht cachen!
  if (event.request.method === 'POST' || event.request.url.includes('script.google.com')) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
