// Service worker: offline support with a versioned cache.
//
// - Navigations (HTML) are network-first so a new GitHub Pages deploy is picked
//   up as soon as the device is online, falling back to cache when offline.
// - Other static assets are cache-first with background revalidation.
// - All URLs are resolved relative to the worker's own location, so the app
//   works correctly when served from a repository subpath.
//
// Bump CACHE_VERSION to force-evict stale assets on the next visit.

const CACHE_VERSION = 'drystack-v1';

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Individual failures shouldn't abort the whole install.
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((r) => r || caches.match(new URL('./index.html', self.location).href))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
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
    })
  );
});
