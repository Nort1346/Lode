import { copyFile, link, mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { createLogger } from '#server/utils/logger'
import type { MediaImportMethod, MediaImportMode, ImportSingleFileResult } from '#server/types/media-organize'

const log = createLogger('MediaImport')

// Sampling interval for the copy progress. Cheap (one stat per tick) and
// filesystem-agnostic: streaming through Node would be slower than the kernel
// copyFile on local disks and no faster on FUSE mounts.
const PROGRESS_POLL_MS = 400

function isCrossDevice(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EXDEV'
}

export function isEexist(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST'
}

async function targetSize(target: string): Promise<number> {
  return (await stat(target)).size
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

// Reserving the target with 'wx' makes the commit mutually exclusive: copy and
// move rename over an existing file, so a second download finishing at the
// same time would otherwise silently overwrite the first one's import.
async function reserveTarget(target: string): Promise<void> {
  const handle = await open(target, 'wx')
  await handle.close()
}

async function commitReserved(partial: string, target: string): Promise<void> {
  try {
    await rename(partial, target)
  } catch (err) {
    await unlink(target).catch(() => {})
    throw err
  }
}

async function copyPartial(source: string, partial: string, onProgress?: (bytes: number) => void): Promise<void> {
  if (onProgress === undefined) {
    await copyFile(source, partial)
    return
  }

  // copyFile has no progress hooks, so the .partial file is sampled while the
  // kernel copies. The final size is reported once more in case the copy beat
  // the sampler.
  const stop = watchPartialSize(partial, onProgress)
  try {
    await copyFile(source, partial)
  } finally {
    stop()
  }
}

interface CopyIntoTargetOptions {
  onProgress?: (bytes: number) => void
  removeSource?: boolean
  targetReserved?: boolean
}

async function copyIntoTarget(source: string, target: string, options: CopyIntoTargetOptions = {}): Promise<void> {
  // A unique partial keeps overlapping imports of the same release from
  // stomping on each other's temp file before the exclusive commit.
  const partial = `${target}.partial-${randomUUID()}`
  try {
    await copyPartial(source, partial, options.onProgress)
    if (options.targetReserved !== true) await reserveTarget(target)
    await commitReserved(partial, target)
    if (options.onProgress !== undefined) {
      try {
        options.onProgress((await stat(target)).size)
      } catch {
        // The target disappeared (deleted by the user mid-import) - nothing to report.
      }
    }
    if (options.removeSource === true) {
      await unlink(source).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`cleanup of move source failed: ${source}: ${msg}`)
      })
    }
  } finally {
    await unlink(partial).catch(() => {})
  }
}

function watchPartialSize(path: string, onProgress: (bytes: number) => void): () => void {
  let active = true
  let busy = false
  const tick = async (): Promise<void> => {
    if (!active || busy) return
    busy = true
    try {
      onProgress((await stat(path)).size)
    } catch {
      // .partial not written yet
    } finally {
      busy = false
    }
  }
  const timer = setInterval(() => {
    void tick()
  }, PROGRESS_POLL_MS)
  return () => {
    active = false
    clearInterval(timer)
  }
}

// Imports one finished file into the library. Hardlinks are zero-copy and keep
// the torrent seeding, so they are tried first in 'hardlink' mode; a
// cross-device staging/library split (or SFTP mounts) answers EXDEV and falls
// back to a plain copy. Copy/move go through a unique .partial temp file and an
// exclusive commit so Jellyfin never observes a half-written file and two
// imports of the same release cannot overwrite each other.
export async function importSingleFile(
  source: string,
  target: string,
  mode: MediaImportMode,
  onProgress?: (bytes: number) => void
): Promise<ImportSingleFileResult> {
  await ensureDir(dirname(target))

  if (mode === 'hardlink') {
    try {
      await link(source, target)
      // Zero-copy: no bytes were transferred.
      return { method: 'hardlink', bytes: 0 }
    } catch (err) {
      // EEXIST means the target raced into place and the caller reports a skip.
      // Every other failure (EXDEV across disks, EPERM/ENOTSUP on SMB/NFS,
      // EMLINK, ...) falls back to a copy so a filesystem that cannot hardlink
      // never fails the whole import.
      if (isEexist(err)) throw err
      const msg = err instanceof Error ? err.message : String(err)
      log.info(`hardlink unavailable (${msg}), falling back to copy: ${target}`)
      await copyIntoTarget(source, target, { onProgress })
      return { method: 'copy', bytes: await targetSize(target) }
    }
  }

  if (mode === 'move') {
    let reserved = false
    try {
      await reserveTarget(target)
      reserved = true
      try {
        await rename(source, target)
        return { method: 'move', bytes: await targetSize(target) }
      } catch (err) {
        if (!isCrossDevice(err)) throw err
        const msg = err instanceof Error ? err.message : String(err)
        log.info(`move unavailable across devices (${msg}), falling back to copy+delete: ${target}`)
        await copyIntoTarget(source, target, { onProgress, removeSource: true, targetReserved: true })
        return { method: 'copy', bytes: await targetSize(target) }
      }
    } catch (err) {
      if (reserved) await unlink(target).catch(() => {})
      throw err
    }
  }

  await copyIntoTarget(source, target, { onProgress })
  const method: MediaImportMethod = 'copy'
  return { method, bytes: await targetSize(target) }
}

// Optional *arr-style staging dir for qBittorrent. Only movies and series
// support one; returns null when it is not configured so the caller can report
// the download as failed instead of writing into the library.
export function resolveStagingDir(
  savePath: string,
  config: { downloadPathMovies: string; downloadPathSeries: string }
): string | null {
  if (savePath === 'series') {
    const dir = config.downloadPathSeries ?? ''
    return dir !== '' ? dir : null
  }
  if (savePath === 'movies') {
    const dir = config.downloadPathMovies ?? ''
    return dir !== '' ? dir : null
  }
  return null
}

export function resolveLibraryDir(
  savePath: string,
  config: { savePathMovies: string; savePathSeries: string }
): string {
  if (savePath === 'series') return config.savePathSeries
  return config.savePathMovies
}

export function buildAbsoluteTarget(libraryDir: string, relativePath: string): string {
  return join(libraryDir, relativePath)
}
