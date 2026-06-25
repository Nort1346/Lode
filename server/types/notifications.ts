export enum NotificationType {
  DOWNLOAD_COMPLETE = 'download_complete',
  REQUEST_ACCEPTED = 'request_accepted',
  REQUEST_REJECTED = 'request_rejected'
}

export interface NotificationDataMap {
  [NotificationType.DOWNLOAD_COMPLETE]: {
    downloadId: string
    mediaType: 'movie' | 'tv' | null
    mediaTitle: string
    posterUrl: string | null
    sizeBytes: number
    savePath: string
  }
  [NotificationType.REQUEST_ACCEPTED]: {
    requestId: string
    mediaType: 'movie' | 'tv'
    mediaId: number
    mediaTitle: string
    posterUrl: string | null
  }
  [NotificationType.REQUEST_REJECTED]: {
    requestId: string
    mediaType: 'movie' | 'tv'
    mediaId: number
    mediaTitle: string
    posterUrl: string | null
    adminNote: string | null
  }
}

export type NotificationRow = {
  id: string
  userId: string
  type: string
  title: string
  message: string
  link: string | null
  data: string | null
  read: boolean
  createdAt: string
}

export type NotificationItem = Omit<NotificationRow, 'data'> & {
  data: Record<string, unknown> | null
}

export const SSE_EVENT_INIT = 'init'
export const SSE_EVENT_NOTIFICATION = 'notification'
export const SSE_EVENT_READ_UPDATE = 'read_update'
export const SSE_EVENT_READ_ALL_UPDATE = 'read_all_update'

export const API_NOTIFICATIONS = '/api/notifications'
export const API_NOTIFICATIONS_SUBSCRIBE = '/api/notifications/subscribe'
export const API_NOTIFICATIONS_UNSUBSCRIBE = '/api/notifications/unsubscribe'
export const API_NOTIFICATIONS_STREAM = '/api/notifications/stream'
export const API_NOTIFICATIONS_READ_ALL = '/api/notifications/read-all'

export const PUSH_ICON = '/pwa-192x192.png'
export const PUSH_BADGE = '/pwa-64x64.png'

export const ROUTE_DASHBOARD = '/dashboard'
export const ROUTE_DOWNLOADS = '/dashboard/downloads'

export const STORAGE_PUSH_KEY = 'push_subscribed'
export const SSE_RECONNECT_MS = 5000
export const BADGE_MAX = 99

export interface SubscribeBody {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface UnsubscribeBody {
  endpoint?: string
}
