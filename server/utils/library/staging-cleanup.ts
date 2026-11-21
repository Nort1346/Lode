import { isAbsolute, dirname, join, relative, resolve } from 'node:path'
import { realpath, rmdir, stat, unlink } from 'node:fs/promises'
import { createLogger } from '#server/utils/logger'
import type { TorrentFile } from '#server/types/torrent'

const log = createLogger('StagingCleanup')

// True when `child` is `parent` or lives below it. Mirrors the guard used by
// the importer so cleanup can never escape the staging directory.
function isSameOrInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

// A `move` import takes the files it selected out of staging and leaves the
// rest of the release behind (covers, .screens, .url, .txt, plus any video or
// subtitle the importer did not take). In move mode the torrent is not seeded,
// so the whole leftover set is garbage - deleting only "junk" extensions would
// keep the release folder alive forever. The guards below make sure only files
// the torrent itself lists, inside its save dir and below the staging root,
// are touched; the staging root and the library are never removed.
export async function cleanupStagingLeftovers(input: {
  files: readonly TorrentFile[]
  saveDir: string
  stagingDir: string
}): Promise<number> {
  // Resolve both sides first: a symlinked save dir must not point the cleanup
  // at a directory outside the configured staging root.
  let stagingRoot: string
  let saveDir: string
  try {
    ;[stagingRoot, saveDir] = await Promise.all([realpath(input.stagingDir), realpath(input.saveDir)])
  } catch {
    // The release folder is already gone - nothing left to clean.
    return 0
  }

  if (!isSameOrInside(stagingRoot, saveDir)) {
    log.warn(`skipping cleanup outside staging: save_path=${saveDir} staging=${stagingRoot}`)
    return 0
  }

  let removed = 0
  const touchedDirs = new Set<string>()

  for (const file of input.files) {
    const path = join(saveDir, file.name)
    // qBittorrent reports names relative to save_path; reject anything that
    // would resolve outside it before unlinking.
    if (!isSameOrInside(saveDir, path)) continue

    try {
      const info = await stat(path)
      if (!info.isFile()) continue
      // realpath resolves symlinked parents, so a torrent folder that links
      // outside staging is skipped instead of deleting foreign files.
      if (!isSameOrInside(saveDir, await realpath(path))) continue
      await unlink(path)
      removed++
      touchedDirs.add(dirname(path))
    } catch {
      // Already gone (moved by the import or deleted by qBittorrent).
    }
  }

  await pruneEmptyDirs(touchedDirs, stagingRoot)
  if (removed > 0) log.info(`staging cleanup removed ${removed} leftover file(s) from ${saveDir}`)
  return removed
}

async function pruneEmptyDirs(dirs: Iterable<string>, stagingDir: string): Promise<void> {
  const root = resolve(stagingDir)
  // A Set keeps a parent from being queued once per emptied child.
  const queue = [...new Set(dirs)]

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
