import type { Download } from '~/types/downloads'

// Percent of the library import phase. A live copy reports real bytes; a
// settled import ('done'), a clean 'skipped' (organization off or a non-media
// category) and a 'failed' import are done for the notification gate. A
// 'pending' row without a live entry (right after a restart, before the retry
// sweep) is still at zero.
export function computeImportPercent(dl: Download): number {
  if (dl.organizeProgress) return dl.organizeProgress.percent
  if (dl.organizeStatus === 'pending') return 0
  return 100
}

// Percent of the fixed wait. The countdown starts when the import settles
// (prepStartedAt), not when the download finishes, so the wait bar fills only
// after the import bar is full. Older rows fall back to completedAt.
export function computeWaitPercent(
  dl: Download,
  delaySeconds: number,
  countdownEnabled: boolean,
  now = Date.now()
): number {
  if (!countdownEnabled) return 100

  const startedAt = dl.prepStartedAt ?? dl.completedAt
  if (startedAt === null || startedAt === '') return 0
  if (delaySeconds <= 0) return 100

  const elapsed = (now - new Date(startedAt).getTime()) / 1000
  const percent = Math.min(100, Math.max(0, (elapsed / delaySeconds) * 100))
  return Math.round(percent * 10) / 10
}
