// Service worker: offline support with a versioned cache.
//
// Strategy:
// - App shell and code (HTML, CSS, JS) are network-first: online visitors always
//   get the latest deploy; the cache is only a fallback when offline. This
//   prevents stale code lingering after a GitHub Pages update.
// - Other assets (icons, manifest) are cache-first with background revalidation
//   for speed, since they change rarely.
// - All URLs resolve relative to the worker's own location, so the app works
//   from a repository subpath.
//
// Bump CACHE_VERSION whenever cached assets should be force-evicted on upgrade.

const CACHE_VERSION = 'drystack-v3';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/main.js',
  './src/game/rules.js',
  './src/game/pieceDefinitions.js',
  './src/game/Piece.js',
  './src/game/Board.js',
  './src/game/CollisionSystem.js',
  './src/game/RotationSystem.js',
  './src/game/PieceGenerator.js',
  './src/game/ScoreSystem.js',
  './src/game/Game.js',
  './src/input/InputManager.js',
  './src/input/KeyboardInput.js',
  './src/input/TouchInput.js',
  './src/rendering/Renderer.js',
  './src/ui/UIController.js',
  './src/storage/StorageManager.js',
  './src/audio/AudioManager.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
].map((p) => new URL(p, self.location).href);

const INDEX = new URL('./index.html', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first: fetch fresh, cache a copy, fall back to cache when offline.
function networkFirst(request, fallbackToIndex) {
  return fetch(request)
    .then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
      }
      return res;
    })
    .catch(() =>
      caches
        .match(request)
        .then((r) => r || (fallbackToIndex ? caches.match(INDEX) : undefined))
    );
}

// Cache-first with background revalidation, for rarely-changing assets.
function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => cached);
    return cached || network;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');
  const isCode = sameOrigin && /\.(?:js|css|html)$/.test(url.pathname);

  if (isNavigation || isCode) {
    event.respondWith(networkFirst(request, isNavigation));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
