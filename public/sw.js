// Bleumr PWA Service Worker — auto-updating
// IMPORTANT: Change this string on every deploy to force SW update on all devices
const CACHE_VERSION = 'v1.6.0-20260405';
const CACHE_NAME = `bleumr-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/Icon.png',
];

// Install — cache shell + force activate immediately (don't wait for old SW to die)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting(); // activate immediately, don't wait
});

// Activate — purge ALL old caches, claim all tabs, force reload
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()) // take control of all tabs immediately
     .then(() => {
       // Force all open tabs to reload with new code
       self.clients.matchAll({ type: 'window' }).then((clients) => {
         clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
       });
     })
  );
});

// Fetch strategy:
// - API calls: pass through (never cache)
// - HTML/JS/CSS: ALWAYS network first — this is how updates reach the user
// - Images/fonts: cache first for speed
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never touch API calls
  if (
    url.hostname.includes('groq.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('duckduckgo.com') ||
    url.hostname.includes('pollinations.ai') ||
    url.hostname.includes('huggingface.co') ||
    url.hostname.includes('deepgram.com') ||
    url.hostname.includes('corsproxy.io') ||
    url.hostname.includes('allorigins.win') ||
    url.hostname.includes('codetabs.com') ||
    url.hostname.includes('thingproxy.freeboard.io') ||
    url.hostname.includes('validator.w3.org') ||
    url.hostname.includes('jigsaw.w3.org') ||
    url.pathname.startsWith('/ddg') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // browser handles these directly
  }

  // HTML, JS, CSS → NETWORK FIRST (always get latest from server)
  const isAppCode =
    event.request.destination === 'document' ||
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/';

  if (isAppCode) {
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

  // Images, fonts, icons → cache first (speed)
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
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
