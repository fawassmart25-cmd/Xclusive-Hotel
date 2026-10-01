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

const serviceWorker = `const CACHE = 'xclusive-hotel-shell-v11';
const SHELL = ['./', './index.html', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
  });
  self.addEventListener('activate', event => event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('xclusive-hotel-shell-') && key !== CACHE).map(key => caches.delete(key))))
        .then(() => self.clients.claim())
        ));
        self.addEventListener('fetch', event => {
          const request = event.request;
            if (request.method !== 'GET') return;
              event.respondWith(
                  fetch(request).then(response => {
                        // Never cache GitHub Pages 404/5xx fallback HTML as an application asset.
                              if (response.ok) {
                                      const copy = response.clone();
                                              caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
                                                    }
                                                          return response;
                                                              }).catch(() => caches.match(request).then(cached => {
                                                                    if (cached) return cached;
                                                                          if (request.mode === 'navigate' || request.destination === 'document') return caches.match('./index.html');
                                                                                return new Response('', { status: 503, statusText: 'Offline' });
                                                                                    }))
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
