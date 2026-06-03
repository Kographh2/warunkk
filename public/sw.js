const CACHE_NAME = 'pratapa-warung-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/logo.svg', '/manifest.webmanifest']).catch(() => undefined)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Pratapa Mart', body: 'Ada info baru dari warung.', url: '/', tag: 'pratapa-info' };
  try {
    data = event.data ? event.data.json() : data;
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pratapa Mart', {
      body: data.body || 'Ada info baru dari warung.',
      icon: data.icon || '/logo.svg',
      badge: '/logo.svg',
      image: data.image,
      tag: data.tag || 'pratapa-info',
      renotify: true,
      data: data.url || '/',
      actions: data.actions || [{ action: 'open', title: 'Buka Warung' }]
    })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'SHOW_NOTIFICATION') return;
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pratapa Mart', {
      body: data.body || 'Ada info baru dari warung.',
      icon: data.icon || '/logo.svg',
      badge: '/logo.svg',
      image: data.image,
      tag: data.tag || 'pratapa-info',
      data: data.url || '/',
      actions: [{ action: 'open', title: 'Buka Warung' }]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
