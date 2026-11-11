self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('Beta_')).map((k) => caches.delete(k))
      );
    } catch {}
    try {
      await self.registration.unregister();
    } catch {}
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (typeof client.navigate === 'function') {
        try { await client.navigate(client.url); } catch {}
      }
    }
  })());
});
