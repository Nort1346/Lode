import type { NotificationItem } from '#server/types/notifications'
import {
  API_NOTIFICATIONS,
  API_NOTIFICATIONS_READ_ALL,
  API_NOTIFICATIONS_STREAM,
  API_NOTIFICATIONS_SUBSCRIBE,
  API_NOTIFICATIONS_UNSUBSCRIBE,
  BADGE_MAX,
  SSE_EVENT_INIT,
  SSE_EVENT_NOTIFICATION,
  SSE_EVENT_READ_UPDATE,
  SSE_EVENT_READ_ALL_UPDATE,
  SSE_RECONNECT_MS
} from '#server/types/notifications'

const notifications = ref<NotificationItem[]>([])
const unreadCount = ref(0)
const connected = ref(false)
const permissionGranted = ref(false)
let eventSource: EventSource | null = null
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = SSE_RECONNECT_MS
let newNotificationCallback: ((n: NotificationItem) => void) | null = null
// Shared pulse so every mounted instance can animate its own bell; the callback slot above
// still fires global side-effects (sound/toast) exactly once
const lastNotification = ref<NotificationItem | null>(null)

// One shared context: browsers cap the number of live AudioContexts, and creating one per
// notification would hit that cap during download bursts
let audioCtx: AudioContext | null = null

export function playNotificationSound() {
  if (import.meta.server) return
  try {
    if (audioCtx === null) audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    const ctx = audioCtx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    audioCtx = null
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
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

export function useNotifications() {
  // Returns an unregister; only clears the slot if this callback is still the current one,
  // so an unmounting instance never drops the callback of another live instance
  function onNewNotification(callback: (n: NotificationItem) => void): () => void {
    newNotificationCallback = callback
    return () => {
      if (newNotificationCallback === callback) newNotificationCallback = null
    }
  }

  function checkPermission() {
    if (import.meta.server) return
    permissionGranted.value = 'Notification' in window && Notification.permission === 'granted'
  }

  async function requestPermission(): Promise<boolean> {
    if (import.meta.server) return false
    if (!('Notification' in window)) return false

    const result = await Notification.requestPermission()
    permissionGranted.value = result === 'granted'
    return permissionGranted.value
  }

  async function subscribeToPush(): Promise<boolean> {
    if (import.meta.server) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    if (Notification.permission !== 'granted') return false

    try {
      const config = useRuntimeConfig()
      const vapidKey = config.public.vapidPublicKey as string
      if (vapidKey === '') {
        // eslint-disable-next-line no-console
        console.error('VAPID public key not configured')
        return false
      }

      const registration = await navigator.serviceWorker.ready
      const vapidBytes = urlBase64ToUint8Array(vapidKey)

      const existing = await registration.pushManager.getSubscription()
      if (existing !== null) {
        const rawKey = existing.options.applicationServerKey
        if (rawKey === null) {
          await existing.unsubscribe()
        } else {
          const existingKey = new Uint8Array(rawKey)
          const hasCorrectKey =
            existingKey.length === vapidBytes.length && existingKey.every((val, i) => val === vapidBytes[i])

          if (hasCorrectKey) {
            const sub = existing.toJSON()
            if (sub.endpoint && sub.keys) {
              await $fetch(API_NOTIFICATIONS_SUBSCRIBE, {
                method: 'POST',
                body: {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.keys.p256dh ?? '', auth: sub.keys.auth ?? '' }
                }
              })
            }
            return true
          }

          await existing.unsubscribe()
        }
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes
      })

      const sub = subscription.toJSON()
      if (!sub.endpoint || !sub.keys) return false

      await $fetch(API_NOTIFICATIONS_SUBSCRIBE, {
        method: 'POST',
        body: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh ?? '', auth: sub.keys.auth ?? '' }
        }
      })

      return true
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Push subscription failed:', err)
      return false
    }
  }

  async function unsubscribeFromPush() {
    if (import.meta.server) return
    if (!('serviceWorker' in navigator)) return

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription !== null) {
        await subscription.unsubscribe()
        await $fetch(API_NOTIFICATIONS_UNSUBSCRIBE, { method: 'POST', body: { endpoint: subscription.endpoint } })
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Push unsubscribe failed:', err)
    }
  }

  function connect() {
    if (import.meta.server || eventSource !== null) return

    eventSource = new EventSource(API_NOTIFICATIONS_STREAM)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string
          unreadCount?: number
          notification?: NotificationItem
          notificationId?: string
        }

        if (data.type === SSE_EVENT_INIT && data.unreadCount !== undefined) {
          unreadCount.value = data.unreadCount
          reconnectDelay = SSE_RECONNECT_MS
          void fetchNotifications()
        } else if (data.type === SSE_EVENT_NOTIFICATION && data.notification !== undefined) {
          notifications.value.unshift(data.notification)
          unreadCount.value++
          lastNotification.value = data.notification
          newNotificationCallback?.(data.notification)
        } else if (data.type === SSE_EVENT_READ_UPDATE && data.notificationId !== undefined) {
          const n = notifications.value.find((x) => x.id === data.notificationId)
          if (n !== undefined && !n.read) {
            n.read = true
            unreadCount.value = Math.max(0, unreadCount.value - 1)
          }
        } else if (data.type === SSE_EVENT_READ_ALL_UPDATE) {
          for (const n of notifications.value) {
            n.read = true
          }
          unreadCount.value = 0
        }
      } catch {
        /* SSE parse error */
      }
    }

    eventSource.onopen = () => {
      connected.value = true
    }

    eventSource.onerror = () => {
      connected.value = false
      eventSource?.close()
      eventSource = null
      reconnectTimeout = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 60_000)
        connect()
      }, reconnectDelay)
    }
  }

  function disconnect() {
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    eventSource?.close()
    eventSource = null
    connected.value = false
  }

  async function fetchNotifications() {
    try {
      const res = await $fetch<{ notifications: NotificationItem[]; unreadCount: number }>(API_NOTIFICATIONS)
      notifications.value = res.notifications
      unreadCount.value = res.unreadCount
    } catch {
      /* ignored */
    }
  }

  async function markAsRead(id: string) {
    try {
      await $fetch(`${API_NOTIFICATIONS}/${id}/read`, { method: 'PATCH' })
      const n = notifications.value.find((x) => x.id === id)
      if (n !== undefined && !n.read) {
        n.read = true
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } catch {
      /* ignored */
    }
  }

  async function markAllAsRead() {
    try {
      await $fetch(API_NOTIFICATIONS_READ_ALL, { method: 'POST' })
      for (const n of notifications.value) {
        n.read = true
      }
      unreadCount.value = 0
    } catch {
      /* ignored */
    }
  }

  async function enableNotifications(): Promise<boolean> {
    if (import.meta.server) return false
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const granted = await requestPermission()
    if (!granted) return false

    const subscribed = await subscribeToPush()
    if (!subscribed) {
      permissionGranted.value = false
      return false
    }
    return true
  }

  return {
    notifications,
    unreadCount,
    connected,
    permissionGranted,
    lastNotification,
    connect,
    disconnect,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    requestPermission,
    subscribeToPush,
    unsubscribeFromPush,
    checkPermission,
    onNewNotification,
    enableNotifications
  }
}

export { BADGE_MAX }
