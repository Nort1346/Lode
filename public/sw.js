importScripts('./sw-push.js')

const CACHE_PREFIX = 'lode-precache-'
const manifest = self.__WB_MANIFEST || []
const precacheUrls = manifest.map(
  (entry) => new URL(typeof entry === 'string' ? entry : entry.url, self.registration.scope).href
)
const precacheSet = new Set(precacheUrls)
const cacheName = CACHE_PREFIX + fingerprint(manifest)

function fingerprint(entries) {
  const source = JSON.stringify(entries)
  let hash = 5381
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(precacheUrls))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== cacheName).map((key) => caches.delete(key))
          )
        ),
      self.clients.claim()
    ])
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !precacheSet.has(event.request.url)) return
  event.respondWith(
    caches.open(cacheName).then((cache) => cache.match(event.request).then((cached) => cached ?? fetch(event.request)))
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
