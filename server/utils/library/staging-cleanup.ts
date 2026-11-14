import { isAbsolute, dirname, join, relative, resolve } from 'node:path'
import { rmdir, stat, unlink } from 'node:fs/promises'
import { createLogger } from '#server/utils/logger'
import type { TorrentFile } from '#server/types/torrent'

const log = createLogger('StagingCleanup')

// True when `child` is `parent` or lives below it. Mirrors the guard used by
// the importer so cleanup can never escape the staging directory.
function isSameOrInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

// A `move` import takes the video files out of staging and leaves everything
// the torrent also shipped (covers, .screens, .url, .txt). This removes exactly
// the files the torrent lists, then prunes the directories that became empty -
// it never touches a path outside the torrent's own save directory and never
// removes the staging root itself.
export async function cleanupStagingLeftovers(input: {
  files: readonly TorrentFile[]
  saveDir: string
  stagingDir: string
}): Promise<number> {
  if (!isSameOrInside(input.stagingDir, input.saveDir)) {
    log.warn(`skipping cleanup outside staging: save_path=${input.saveDir} staging=${input.stagingDir}`)
    return 0
  }

  let removed = 0
  const touchedDirs = new Set<string>()

  for (const file of input.files) {
    const path = join(input.saveDir, file.name)
    // qBittorrent reports names relative to save_path; reject anything that
    // would resolve outside it before unlinking.
    if (!isSameOrInside(input.saveDir, path)) continue

    try {
      const info = await stat(path)
      if (!info.isFile()) continue
      await unlink(path)
      removed++
      touchedDirs.add(dirname(path))
    } catch {
      // Already gone (moved by the import or deleted by qBittorrent).
    }
  }

  await pruneEmptyDirs(touchedDirs, input.stagingDir)
  if (removed > 0) log.info(`staging cleanup removed ${removed} leftover file(s) from ${input.saveDir}`)
  return removed
}

async function pruneEmptyDirs(dirs: Iterable<string>, stagingDir: string): Promise<void> {
  const root = resolve(stagingDir)
  const queue = [...dirs]

  while (queue.length > 0) {
    const dir = queue.pop()
    if (dir === undefined) break

    const absolute = resolve(dir)
    if (absolute === root || !isSameOrInside(root, absolute)) continue

    // rmdir fails with ENOTEMPTY when files remain, which is what we want: only
    // folders the import fully emptied disappear.
    try {
      await rmdir(absolute)
      queue.push(dirname(absolute))
    } catch {
      // Not empty or already removed.
    }
  }
}
