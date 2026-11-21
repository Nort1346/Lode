import type { Download } from '~/types/downloads'

// Percent of the preparation bar. The bar reaches 100 exactly when the row
// turns green (the ready notification fires), so it follows the slower of the
// two gates instead of the faster:
// - the simulated countdown, only when enabled: how long the notification waits;
// - the real import: the bytes that must land in the library first.
// Whichever phase is not finished yet keeps the bar below 100, so a fast
// (e.g. hardlink) import no longer jumps the bar to 100 while the countdown
// is still running, and a slow copy is never masked by the simulated time.
export function computePrepPercent(
  dl: Download,
  speedBytesPerSecond: number,
  countdownEnabled: boolean,
  now = Date.now()
): number {
  if (dl.completedAt === null || dl.completedAt === '') return 0

  // Countdown side. Disabled means the notification is gated by the import
  // alone, so the time side is already satisfied.
  let timePercent = 100
  if (countdownEnabled && speedBytesPerSecond > 0) {
    const elapsed = (now - new Date(dl.completedAt).getTime()) / 1000
    const delay = dl.sizeBytes / speedBytesPerSecond
    timePercent = delay > 0 ? Math.min(100, (elapsed / delay) * 100) : 100
  }

  // Import side. A copy in flight reports its real percent; a settled import
  // ('done'), a row with no import at all ('skipped' - organization off or a
  // non-media category) and a failed import ('failed', which the notification
  // does not wait for) are satisfied. A 'pending' row without a live entry
  // (right after a restart, before the retry sweep) still reports 0: its
  // bytes are not in the library yet.
  let bytePercent = 100
  if (dl.organizeProgress) {
    bytePercent = dl.organizeProgress.percent
  } else if (dl.organizeStatus === 'pending') {
    bytePercent = 0
  }

  // The min of two monotonic functions is monotonic: the bar never goes
  // backwards.
  return Math.round(Math.min(timePercent, bytePercent) * 10) / 10
}
