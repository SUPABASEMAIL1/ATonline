// Install: immediately take over
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Activate: delete ALL caches → unregister itself → claim clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((name) => caches.delete(name)));
    }).then(() => self.registration.unregister())
     .then(() => self.clients.claim())
  );
});

// Fetch: DO NOT intercept anything (passive)
self.addEventListener('fetch', (e) => {
  // no-op (passive)
});
