// Bleumr PWA Service Worker v3 — auto-updating
// BUMP THIS on every deploy to bust the cache
const CACHE_VERSION = '__BUILD_TIME__';
// force-bust: 1.3.0
const CACHE_NAME = `bleumr-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/Icon.png',
];

// Install — cache shell + force activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — purge ALL old caches, then claim clients so update takes effect instantly
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => {
       // Notify all open tabs to reload
       self.clients.matchAll({ type: 'window' }).then((clients) => {
         clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
       });
     })
  );
});

// Fetch — network-first for HTML/JS/CSS, cache-first for images/fonts
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls or streaming endpoints
  if (
    url.hostname.includes('groq.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('duckduckgo.com') ||
    url.hostname.includes('pollinations.ai') ||
    url.hostname.includes('huggingface.co') ||
    url.hostname.includes('deepgram.com') ||
    url.pathname.startsWith('/ddg')
  ) {
    return; // let browser handle normally
  }

  // HTML, JS, CSS → network-first (always get latest, fallback to cache offline)
  const isAppAsset =
    event.request.destination === 'document' ||
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/';

  if (isAppAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Everything else (images, fonts, icons) → cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
      // Return a proper error response instead of undefined/null
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
