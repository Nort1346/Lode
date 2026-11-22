import type { Download } from '~/types/downloads'
import type { NotificationItem } from '#server/types/notifications'
import { NotificationType } from '#server/types/notifications'

// Flips the row the moment the ready notification arrives - the same SSE event
// that shows the toast and the push - instead of waiting for the next poll, so
// the progress bar never lingers after the user was already told it is done.
// Returns true when a row was updated.
export function markDownloadReady(
  downloads: Download[],
  notification: Pick<NotificationItem, 'type' | 'data' | 'createdAt'>
): boolean {
  if (notification.type !== NotificationType.DOWNLOAD_COMPLETE) return false

  const downloadId = notification.data?.downloadId
  if (typeof downloadId !== 'string') return false

  const dl = downloads.find((row) => row.id === downloadId)
  if (dl === undefined || dl.notifiedAt !== null) return false

  dl.notifiedAt = notification.createdAt
  // The import is done by definition once the notification is out; drop the
  // stale live-progress entry so the row renders as a plain success.
  dl.organizeProgress = null
  return true
}
