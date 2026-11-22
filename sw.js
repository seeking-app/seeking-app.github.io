/* 尋道 service worker: precache everything listed in precache.json; serve offline.
   tools/build.py rewrites VERSION on every build, so each new build changes this file's bytes
   and the browser installs the new worker (and with it the new content). */
const VERSION = '85b741946d47';
const CACHE = 'xundao-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const m = await (await fetch('precache.json', { cache: 'no-store' })).json();
    const cache = await caches.open(CACHE);
    // bypass the HTTP cache so the new build's files are fetched fresh
    await cache.addAll(m.files.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('xundao-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      return Response.error();
    }
  })());
});
