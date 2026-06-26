self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = { title: 'StreamHub', body: '', icon: '/pwa-192x192.png', tag: '', data: {}, lang: 'pl' }

  try {
    const data = event.data?.json()
    if (data !== undefined) {
      payload = { ...payload, ...data }
    }
  } catch {}

  const options = {
    body: payload.body,
    icon: payload.icon,
    tag: payload.tag,
    data: payload.data,
    lang: payload.lang,
    dir: 'ltr'
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.link ?? '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(self.registration.scope))
      if (existing) {
        existing.focus()
        if ('navigate' in existing) {
          return existing.navigate(url)
        }
        return
      }
      return self.clients.openWindow(`${self.registration.scope}?redirect=${encodeURIComponent(url)}`)
    })
  )
})

function swUrlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

async function fetchVapidKey(retries) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('/api/notifications/vapid-key')
      if (!res.ok) continue
      const data = await res.json()
      if (data.publicKey) return data.publicKey
    } catch {}
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
  }
  return null
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const publicKey = await fetchVapidKey(3)
      if (!publicKey) return

      const options = { userVisibleOnly: true, applicationServerKey: swUrlBase64ToUint8Array(publicKey) }

      let sub
      try {
        sub = await self.registration.pushManager.subscribe(options)
      } catch {
        return
      }

      const keys = sub.toJSON().keys
      if (!keys) return

      try {
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint, keys })
        })
      } catch {}
    })()
  )
})
