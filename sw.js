const CACHE_PREFIX = 'pageants';
const CACHE_VERSION = 'v3';
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const APP_SHELL = ['/index.html', '/manifest.json', '/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination);

  if (isStaticAsset) {
    event.respondWith(handleStaticAsset(request));
  }
});

async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const freshResponse = await fetch(new Request(request, { cache: 'no-store' }));

    if (freshResponse.ok) {
      await cache.put('/index.html', freshResponse.clone());
      return freshResponse;
    }

    const shellResponse = await fetch(new Request('/index.html', { cache: 'no-store' }));
    if (shellResponse.ok) {
      await cache.put('/index.html', shellResponse.clone());
      return shellResponse;
    }

    const cachedResponse = await cache.match('/index.html');
    return cachedResponse || freshResponse;
  } catch (error) {
    const cachedResponse = await cache.match('/index.html');
    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);

  if (networkResponse.ok) {
    await cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}
