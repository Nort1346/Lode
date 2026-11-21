import type { Download } from '~/types/downloads'

// Percent of the preparation bar: the higher of the simulated countdown and the
// real bytes copied into the library, so the bar never moves backwards.
//
// Once the import is done (`organizeStatus === 'done'`) the bytes are already in
// the library, but the row can still wait for the ready notification. The
// in-memory progress entry is dropped at that point, so falling back to the
// countdown would make the bar jump back down - a finished import stays at 100.
export function computePrepPercent(dl: Download, speedBytesPerSecond: number, now = Date.now()): number {
  if (dl.completedAt === null || dl.completedAt === '') return 0

  const elapsed = (now - new Date(dl.completedAt).getTime()) / 1000
  const delay = speedBytesPerSecond > 0 ? dl.sizeBytes / speedBytesPerSecond : 0
  const timePercent = delay > 0 ? Math.min(100, (elapsed / delay) * 100) : 100
  const bytePercent = dl.organizeStatus === 'done' ? 100 : (dl.organizeProgress?.percent ?? 0)

  return Math.round(Math.max(timePercent, bytePercent) * 10) / 10
}
