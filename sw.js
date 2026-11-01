/*
 * Private Vault — offline support.
 *
 * Keeps a copy of the app's own files on the device so it opens without
 * internet. It never sees your data: entries live encrypted in the browser's
 * storage and are not part of any request.
 *
 * Strategy: network first (so an update on GitHub shows up as soon as you are
 * online), falling back to the saved copy when offline or the network is too
 * slow. Only files from this site are handled.
 */
const CACHE = 'private-vault-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const SLOW_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // one by one, so a single missing file does not stop the rest
    await Promise.all(FILES.map(f => cache.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate';
  const key = isPage ? './' : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      if (res.ok && !res.redirected) cache.put(key, res.clone());
      return res;
    });
    const slow = new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), SLOW_MS));
    try {
      return await Promise.race([net, slow]);
    } catch (e) {
      const saved = await cache.match(key, { ignoreSearch: true })
                 || (isPage && await cache.match('./index.html'));
      return saved || net;   // nothing saved yet: keep waiting for the network
    }
  })());
});
