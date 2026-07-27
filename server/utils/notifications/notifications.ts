import { randomUUID } from 'node:crypto'
import { notifications, settings } from '#server/database/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { notifySseClients } from './sse-hubs'
import { sendPushToUser } from './push'
import { createLogger } from '#server/utils/logger'
import { createT, DISCORD_LOCALE_OPTIONS } from '#server/utils/i18n-server'
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'

import type { NotificationDataMap, NotificationItem, NotificationType as NotifType } from '#server/types/notifications'
import type { DiscordLocale } from '#server/types/i18n'
import {
  NotificationType,
  PUSH_ICON,
  PUSH_BADGE,
  ROUTE_DASHBOARD,
  ROUTE_DOWNLOADS,
  SSE_EVENT_READ_UPDATE,
  SSE_EVENT_READ_ALL_UPDATE
} from '#server/types/notifications'

const log = createLogger('Notifications')

async function getNotificationLocale(): Promise<DiscordLocale> {
  const db = await useDbAsync()
  const row = await dbGet(db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'discord_locale')))
  const locale = row?.value
  if (locale !== undefined && (DISCORD_LOCALE_OPTIONS as readonly string[]).includes(locale)) {
    return locale as DiscordLocale
  }
  return 'en'
}

export async function createNotification(
  userId: string,
  type: NotifType,
  data: NotificationDataMap[NotifType],
  title: string,
  message: string,
  link?: string
): Promise<void> {
  const db = await useDbAsync()
  const now = new Date().toISOString()
  const resolvedLink = link ?? null

  const existing = await dbGet(
    db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, type), eq(notifications.read, false)))
  )

  if (existing !== undefined) {
    await dbRun(
      db.update(notifications).set({ title, message, createdAt: now }).where(eq(notifications.id, existing.id))
    )

    const item: NotificationItem = {
      id: existing.id,
      userId,
      type,
      title,
      message,
      link: resolvedLink,
      data,
      read: false,
      createdAt: now
    }
    notifySseClients(userId, { type: 'notification', notification: item })

    void sendPushToUser(userId, {
      title,
      body: message,
      icon: data.posterUrl ?? PUSH_ICON,
      badge: PUSH_BADGE,
      tag: `${type}-${existing.id}`,
      data: { link: resolvedLink ?? ROUTE_DASHBOARD }
    }).catch((err) => log.error(err, 'push failed for notification'))
    return
  }

  const id = randomUUID()

  await dbRun(
    db.insert(notifications).values({
      id,
      userId,
      type,
      title,
      message,
      link: link ?? null,
      data: JSON.stringify(data),
      read: false,
      createdAt: now
    })
  )

  const item: NotificationItem = {
    id,
    userId,
    type,
    title,
    message,
    link: link ?? null,
    data,
    read: false,
    createdAt: now
  }

  notifySseClients(userId, { type: 'notification', notification: item })

  void sendPushToUser(userId, {
    title,
    body: message,
    icon: data.posterUrl ?? PUSH_ICON,
    badge: PUSH_BADGE,
    tag: `${type}-${id}`,
    data: { link: link ?? ROUTE_DASHBOARD }
  }).catch((err) => log.error(err, 'push failed for notification'))
}

export async function notifyDownloadComplete(
  userId: string,
  downloadId: string,
  mediaType: 'movie' | 'tv' | null,
  mediaTitle: string,
  posterUrl: string | null,
  sizeBytes: number,
  savePath: string,
  tmdbId: number | null
): Promise<void> {
  const t = createT(await getNotificationLocale())
  const link =
    mediaType !== null && tmdbId !== null
      ? `/browse/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}`
      : ROUTE_DOWNLOADS

  const title = mediaTitle || t('notifications.download_complete.title')
  const message = t('notifications.download_complete.message').replace(
    '{title}',
    mediaTitle || t('notifications.download_complete.title')
  )

  await createNotification(
    userId,
    NotificationType.DOWNLOAD_COMPLETE as NotifType,
    {
      downloadId,
      mediaType,
      mediaTitle,
      posterUrl,
      sizeBytes,
      savePath
    } as NotificationDataMap[NotifType],
    title,
    message,
    link
  )
}

export async function notifyRequestStatus(
  userId: string,
  requestId: string,
  status: 'accepted' | 'rejected',
  mediaType: 'movie' | 'tv',
  mediaId: number,
  mediaTitle: string,
  posterUrl: string | null,
  adminNote: string | null
): Promise<void> {
  const t = createT(await getNotificationLocale())
  const link = `/browse/${mediaType === 'movie' ? 'movie' : 'tv'}/${mediaId}`

  if (status === 'accepted') {
    const title = t('notifications.request_accepted.title')
    const message = t('notifications.request_accepted.message').replace('{title}', mediaTitle)

    await createNotification(
      userId,
      NotificationType.REQUEST_ACCEPTED as NotifType,
      {
        requestId,
        mediaType,
        mediaId,
        mediaTitle,
        posterUrl
      } as NotificationDataMap[NotifType],
      title,
      message,
      link
    )
  } else {
    const title = t('notifications.request_rejected.title')
    const message = t('notifications.request_rejected.message').replace('{title}', mediaTitle)

    await createNotification(
      userId,
      NotificationType.REQUEST_REJECTED as NotifType,
      {
        requestId,
        mediaType,
        mediaId,
        mediaTitle,
        posterUrl,
        adminNote
      } as NotificationDataMap[NotifType],
      title,
      message,
      link
    )
  }
}

export async function getUserNotifications(userId: string, limit = 50): Promise<NotificationItem[]> {
  const db = await useDbAsync()
  const rows = await dbAll(
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
  )

  return rows.map((r) => ({
    ...r,
    data: r.data !== null ? (JSON.parse(r.data) as Record<string, unknown>) : null
  }))
}

export async function getUnreadCount(userId: string): Promise<number> {
  const db = await useDbAsync()
  const [row] = await dbAll(
    db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
  )
  return row?.count ?? 0
}

export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const db = await useDbAsync()
  const { changes } = await dbRun(
    db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
  )
  if (changes > 0) {
    notifySseClients(userId, { type: SSE_EVENT_READ_UPDATE, notificationId })
  }
  return changes > 0
}

export async function markAllAsRead(userId: string): Promise<number> {
  const db = await useDbAsync()
  const { changes } = await dbRun(
    db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
  )
  if (changes > 0) {
    notifySseClients(userId, { type: SSE_EVENT_READ_ALL_UPDATE })
  }
  return changes
}
