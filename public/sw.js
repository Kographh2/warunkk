self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Pratapa Mart', body: 'Ada update pesanan baru.' };
  try {
    data = event.data ? event.data.json() : data;
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pratapa Mart', {
      body: data.body || 'Ada update pesanan baru.',
      icon: '/logo.svg',
      badge: '/logo.svg',
      tag: data.tag || 'pratapa-order',
      data: data.url || '/'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(self.clients.openWindow(url));
});
