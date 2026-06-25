self.addEventListener('push', (event) => {
  let payload = { title: 'StreamHub', body: '', icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: '', data: {} }

  try {
    const data = event.data?.json()
    if (data !== undefined) {
      payload = { ...payload, ...data }
    }
  } catch {}

  const options = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag,
    data: payload.data,
    requireInteraction: false,
    actions: []
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const link = event.notification.data?.link ?? '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) {
            return client.navigate(link)
          }
        }
      }
      return self.clients.openWindow(link)
    })
  )
})
