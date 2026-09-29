import { defineConfig } from 'vite';

const manifest = JSON.stringify({
  name: 'Xclusive Hotel Manager',
  short_name: 'Xclusive',
  start_url: '/Xclusive-Hotel/',
  scope: '/Xclusive-Hotel/',
  display: 'standalone',
  background_color: '#0B0B0F',
  theme_color: '#0B0B0F',
  description: 'Offline-first hotel sales and room management',
}, null, 2);

const serviceWorker = `const CACHE = 'xclusive-hotel-shell-v10';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  event.respondWith(
    fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
  );
});
`;

export default defineConfig({
  base: '/Xclusive-Hotel/',
  plugins: [{
    name: 'xclusive-pwa-assets',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest });
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: serviceWorker });
    },
  }],
  build: { outDir: 'dist' },
});
