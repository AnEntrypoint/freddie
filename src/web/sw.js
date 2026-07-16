// Freddie dashboard Service Worker: caches the shell (index.html, app.js,
// the SDK js/css) for offline VIEWING. Never intercepts POST /api/chat or any
// other /api/* request -- true offline LLM response generation is impossible
// by definition (the model call needs real connectivity), so those requests
// pass straight through to the network and fail naturally if offline; the
// dashboard's own outbox (idb-outbox.js) handles queuing them for reconnect,
// this SW's job is purely "the shell loads with no network."
const CACHE_NAME = 'freddie-dashboard-shell-v1'
const SHELL_URLS = [
    '/',
    '/index.html',
    '/app.js',
    '/vendor/anentrypoint-design/sdk.js',
    '/vendor/anentrypoint-design/sdk.css',
]

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)))
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
    )
    self.clients.claim()
})

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url)
    // API calls (chat, sessions, everything dynamic) always go to the network
    // -- caching a stale API response would silently serve wrong data.
    if (url.pathname.startsWith('/api/')) return
    if (event.request.method !== 'GET') return
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached
            return fetch(event.request).then((res) => {
                if (res.ok && SHELL_URLS.some((u) => url.pathname === u || url.pathname.endsWith(u))) {
                    const clone = res.clone()
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
                }
                return res
            }).catch(() => cached)
        })
    )
})
