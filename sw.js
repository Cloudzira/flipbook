/* FlipbuKu Service Worker
 * - App shell (index.html, ikon, manifest) di-cache agar aplikasi cepat dibuka & tetap tampil saat offline.
 * - Library CDN (Tailwind, FontAwesome, Google Fonts, PDF.js, StPageFlip, Supabase JS) di-cache saat pertama dipakai.
 * - Data Supabase, file PDF, dan panel Al-Quran TIDAK di-cache (selalu langsung ke jaringan).
 * Ubah VERSION kalau Anda mengganti ikon/file shell supaya cache lama dibuang.
 */
const VERSION = 'v1';
const SHELL_CACHE = 'flipbuku-shell-' + VERSION;
const CDN_CACHE = 'flipbuku-cdn-' + VERSION;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-32.png',
  './icon-64.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL_FILES.map((f) => cache.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('flipbuku-') && k !== SHELL_CACHE && k !== CDN_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Halaman utama: jaringan dulu (selalu dapat versi terbaru), cadangan dari cache saat offline
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 2) File statis se-origin (ikon, manifest): cache dulu, perbarui di belakang layar
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 3) Library & font dari CDN: cache dulu, perbarui di belakang layar
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req)
            .then((res) => {
              if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // 4) Lainnya (Supabase, PDF, Al-Quran, dll): langsung ke jaringan, tanpa cache
});
