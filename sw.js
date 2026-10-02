/* Khutbah Live Translator — sw.js (v5.1)
   Network-first for the app's own files, cache fallback when offline.
   Translation APIs and other sites are never cached. */
const CACHE = 'klt-shell-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    e.respondWith(
        fetch(req).then(function (res) {
            if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
            return res;
        }).catch(function () {
            return caches.match(req, { ignoreSearch: true }).then(function (hit) {
                return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
            });
        })
    );
});
