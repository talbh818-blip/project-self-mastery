/* ===========================================================================
 * Web Push handlers — imported into the generated Workbox service worker via
 * `workbox.importScripts` in vite.config.ts. Runs in the SW global scope.
 *
 * Handles:
 *   • push              — the server (api/send-reminders) sent a reminder;
 *                         show it as a notification (works while app is closed).
 *   • notificationclick — focus an open tab, or open the app.
 * =========================================================================== */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'תזכורת';
  const options = {
    body: data.body || '',
    icon: data.icon || '/logo.png?v=5',
    badge: '/logo.png?v=5',
    lang: 'he',
    dir: 'rtl',
    tag: data.tag,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  };
  // Per-reminder vibration (Android). Absent → the OS default for the channel.
  if (Array.isArray(data.vibrate)) options.vibrate = data.vibrate;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of wins) {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })(),
  );
});
