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

export function playNotificationSound() {
  if (import.meta.server) return
  try {
    const ctx = new AudioContext()
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
    /* AudioContext not available */
  }
}

export function useNotifications() {
  function onNewNotification(callback: (n: NotificationItem) => void) {
    newNotificationCallback = callback
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

  async function subscribeToPush() {
    if (import.meta.server) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission !== 'granted') return

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true })

      const sub = subscription.toJSON()
      if (!sub.endpoint || !sub.keys) return

      await $fetch(API_NOTIFICATIONS_SUBSCRIBE, {
        method: 'POST',
        body: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh ?? '', auth: sub.keys.auth ?? '' }
        }
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Push subscription failed:', err)
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

  return {
    notifications,
    unreadCount,
    connected,
    permissionGranted,
    connect,
    disconnect,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    requestPermission,
    subscribeToPush,
    unsubscribeFromPush,
    checkPermission,
    onNewNotification
  }
}

export { BADGE_MAX }
