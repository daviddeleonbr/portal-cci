/* Web Push do portal CCI — importado pelo service worker do Workbox
   (vite.config.js → workbox.importScripts). Payload vem da Edge Function
   push-enviar: { title, body, url, tag, tipo }.
   badge = ícone da BARRA DE STATUS do Android (monocromático: os 3
   triângulos da logo); icon = logo colorida dentro da notificação. */

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  const title = d.title || 'CCI';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: '/pwa-192x192.png',
    badge: '/badge-cci-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
    lang: 'pt-BR',
  }));
});

// Toque na notificação: foca uma aba/janela do app e navega; senão abre uma.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of janelas) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(destino); } catch { /* cross-origin/estado */ } }
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
