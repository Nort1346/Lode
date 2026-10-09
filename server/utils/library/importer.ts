import { copyFile, link, mkdir, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createLogger } from '#server/utils/logger'
import type { MediaImportMethod, MediaImportMode, ImportSingleFileResult } from '#server/types/media-organize'

const log = createLogger('MediaImport')

function isCrossDevice(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EXDEV'
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function copyAtomic(source: string, target: string): Promise<void> {
  const tmpTarget = `${target}.partial`
  await copyFile(source, tmpTarget)
  await rename(tmpTarget, target)
}

async function copyThenRemove(source: string, target: string, removeSource: boolean): Promise<void> {
  await copyAtomic(source, target)
  if (removeSource) {
    await unlink(source).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`cleanup of move source failed: ${source}: ${msg}`)
    })
  }
}

// Imports one finished file into the library. Hardlinks are zero-copy and keep
// the torrent seeding, so they are tried first in 'hardlink' mode; a
// cross-device staging/library split (or SFTP mounts) answers EXDEV and falls
// back to a plain copy. Copy/move go through a .partial temp file plus rename
// so Jellyfin never observes a half-written file.
export async function importSingleFile(
  source: string,
  target: string,
  mode: MediaImportMode
): Promise<ImportSingleFileResult> {
  await ensureDir(dirname(target))

  if (mode === 'hardlink') {
    try {
      await link(source, target)
      return { method: 'hardlink', bytes: 0 }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isCrossDevice(err)) throw err
      log.info(`hardlink unavailable (${msg}), falling back to copy: ${target}`)
      await copyAtomic(source, target)
      return { method: 'copy', bytes: 0 }
    }
  }

  if (mode === 'move') {
    try {
      await rename(source, target)
      return { method: 'move', bytes: 0 }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isCrossDevice(err)) throw err
      log.info(`move unavailable across devices (${msg}), falling back to copy+delete: ${target}`)
      await copyThenRemove(source, target, true)
      return { method: 'copy', bytes: 0 }
    }
  }

  await copyAtomic(source, target)
  const method: MediaImportMethod = 'copy'
  return { method, bytes: 0 }
}

export function resolveStagingDir(
  savePath: string,
  config: { savePathMovies: string; savePathSeries: string; downloadPathMovies: string; downloadPathSeries: string }
): string {
  if (savePath === 'series') {
    return config.downloadPathSeries !== '' ? config.downloadPathSeries : config.savePathSeries
  }
  return config.downloadPathMovies !== '' ? config.downloadPathMovies : config.savePathMovies
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
