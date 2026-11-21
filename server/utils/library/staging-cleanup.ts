import { isAbsolute, dirname, join, relative, resolve } from 'node:path'
import { readdir, realpath, rmdir, stat, unlink } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
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
    } catch {
      // Already gone (moved by the import or deleted by qBittorrent).
    }
  }

  await pruneStagingTree(saveDir, stagingRoot)
  if (removed > 0) log.info(`staging cleanup removed ${removed} leftover file(s) from ${saveDir}`)
  return removed
}

// Removes the directories a finished torrent left behind. A move import (or
// qBittorrent's own delete) empties the folders without removing them, so an
// empty tree - `Release/`, `Release/Subs/`, even the whole category dir -
// accumulates in staging. Every directory below `saveDir` is attempted
// bottom-up; `rmdir` only succeeds on empty dirs, so anything the torrent did
// not list keeps its folder alive. Symlinked folders are never followed or
// removed, and the staging root itself is never removed either.
export async function pruneStagingTree(saveDir: string, stagingDir: string): Promise<void> {
  let base: string
  let root: string
  try {
    ;[base, root] = await Promise.all([realpath(saveDir), realpath(stagingDir)])
  } catch {
    // The folder is already gone - nothing to prune.
    return
  }
  if (!isSameOrInside(root, base)) return

  // Deepest first, so a folder can be removed before its parent is attempted.
  const dirs: string[] = []
  await collectDirs(base === root ? root : base, dirs)
  if (base !== root) {
    // The category dir (e.g. `Movies`) and any intermediate dir may now be
    // empty too; walk up to the staging root, which is never removed.
    let ancestor = dirname(base)
    while (ancestor !== root && isSameOrInside(root, ancestor)) {
      dirs.push(ancestor)
      ancestor = dirname(ancestor)
    }
  }

  for (const dir of dirs) {
    if (dir === root) continue
    try {
      await rmdir(dir)
    } catch {
      // Not empty or already gone.
    }
  }
}

// qBittorrent removes the torrent from its list before its file delete has
// finished, so a prune right after a delete can race it: the folders still
// hold bytes. Retry on a short budget until the folder is gone; whatever
// survives the last pass keeps files the delete did not remove, which this
// function must not take.
export async function pruneStagingUntilGone(saveDir: string, stagingDir: string, attempts = 4): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await pruneStagingTree(saveDir, stagingDir)
    try {
      await stat(saveDir)
    } catch {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

async function collectDirs(dir: string, out: string[]): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await collectDirs(join(dir, entry.name), out)
  }
  out.push(dir)
}
