const CACHE_NAME = 'warunk-online-v3';
const APP_SHELL = ['/', '/logo.svg', '/sound.mp3', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => null))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => null);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'WARUNK_SHOW_NOTIFICATION') return;

  const title = data.title || 'WARUNK ONLINE';
  const options = {
    body: data.body || 'Ada update pesanan baru.',
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: data.tag || 'warunk-update',
    renotify: true,
    requireInteraction: false,
    vibrate: [120, 50, 120],
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }

  const title = data.title || 'WARUNK ONLINE';
  const options = {
    body: data.body || 'Ada update pesanan baru.',
    icon: data.icon || '/logo.svg',
    badge: data.badge || '/logo.svg',
    tag: data.tag || 'warunk-push',
    renotify: true,
    vibrate: [120, 50, 120],
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url).catch(() => null);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
