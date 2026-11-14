import type { ImportProgressSnapshot } from '#server/types/media-organize'

// Sampling window for the speed estimate. Anything shorter is noisy because a
// copy is reported in bursts (page cache flushes, FUSE uploads).
const SPEED_WINDOW_MS = 500

interface ProgressEntry {
  totalBytes: number
  // Fully imported files, so the percentage survives multi-file packs.
  doneBytes: number
  // Bytes of the file currently being copied.
  currentBytes: number
  filesDone: number
  filesTotal: number
  speedBytesPerSecond: number
  lastSampleBytes: number
  lastSampleAt: number
}

// In-memory on purpose: progress only exists while the copy runs and the sync
// loop lives in the same process. A restart drops it and the row stays
// 'pending', which the sweep retries.
const entries = new Map<string, ProgressEntry>()

export function startImportProgress(downloadId: string, totalBytes: number, filesTotal: number): void {
  entries.set(downloadId, {
    totalBytes,
    doneBytes: 0,
    currentBytes: 0,
    filesDone: 0,
    filesTotal,
    speedBytesPerSecond: 0,
    lastSampleBytes: 0,
    lastSampleAt: Date.now()
  })
}

// Absolute byte count of the file being copied right now.
export function reportImportBytes(downloadId: string, fileBytes: number): void {
  const entry = entries.get(downloadId)
  if (entry === undefined) return

  entry.currentBytes = fileBytes
  const copied = entry.doneBytes + fileBytes
  const now = Date.now()
  const elapsed = (now - entry.lastSampleAt) / 1000
  if (elapsed >= SPEED_WINDOW_MS / 1000) {
    const delta = copied - entry.lastSampleBytes
    if (delta >= 0) entry.speedBytesPerSecond = delta / elapsed
    entry.lastSampleBytes = copied
    entry.lastSampleAt = now
  }
}

export function completeImportFile(downloadId: string, sizeBytes: number): void {
  const entry = entries.get(downloadId)
  if (entry === undefined) return
  entry.doneBytes += sizeBytes
  entry.currentBytes = 0
  entry.filesDone++
  entry.lastSampleBytes = entry.doneBytes
}

export function finishImportProgress(downloadId: string): void {
  entries.delete(downloadId)
}

export function getImportProgress(downloadId: string): ImportProgressSnapshot | null {
  const entry = entries.get(downloadId)
  if (entry === undefined) return null

  const copiedBytes = Math.min(entry.totalBytes, entry.doneBytes + entry.currentBytes)
  const percent = entry.totalBytes > 0 ? Math.min(100, Math.round((copiedBytes / entry.totalBytes) * 1000) / 10) : 0

  return {
    percent,
    copiedBytes,
    totalBytes: entry.totalBytes,
    speedBytesPerSecond: Math.max(0, Math.round(entry.speedBytesPerSecond)),
    filesDone: entry.filesDone,
    filesTotal: entry.filesTotal
  }
}

// Test helper - the module is process-global.
export function resetImportProgress(): void {
  entries.clear()
}
