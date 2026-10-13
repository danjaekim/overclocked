// Retired service worker. Offline caching caused Safari to serve stale or failed module loads, so
// the game no longer registers one. This stub stays so any browser that still has the old worker
// fetches it, clears the old caches and unregisters itself. It has no fetch handler.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
      .catch(() => {})
  );
});
