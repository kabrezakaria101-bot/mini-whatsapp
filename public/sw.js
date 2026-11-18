// Service worker minimal : requis pour que le site soit installable.
// Il ne met rien en cache, donc les messages et soldes sont toujours à jour.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
