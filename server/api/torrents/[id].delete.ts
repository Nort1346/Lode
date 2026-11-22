import { downloads } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import { getMediaImportMode } from '#server/utils/library/media-settings'
import { resolveStagingDir } from '#server/utils/library/importer'
import { pruneStagingUntilGone } from '#server/utils/library/staging-cleanup'
import { createLogger } from '#server/utils/logger'
import type { DownloadRow } from '#server/types/torrent'

const log = createLogger('TorrentDelete')

// 'hardlink' and 'copy' guarantee the library has its own copy of the files
// (unknown settings normalize to hardlink), so the torrent's files can always
// go with the torrent. 'move' is different: the files only leave the save
// path after a successful import. While a download is incomplete the save
// path holds partial garbage that must go with the torrent; a completed
// download whose import has not settled yet keeps its files, because in move
// mode they are the only complete copy. An unreadable setting keeps the
// files too: losing a staging copy is harmless, losing the library movie is
// not.
async function shouldDeleteTorrentFiles(download: Pick<DownloadRow, 'status' | 'organizeStatus'>): Promise<boolean> {
  try {
    if ((await getMediaImportMode()) !== 'move') return true
    // The import already took the files out of the save path; only release
    // leftovers remain there, so they can go.
    if (download.organizeStatus === 'done') return true
    return download.status !== 'completed'
  } catch {
    return false
  }
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Download ID is required' })
  }

  const db = await useDbAsync()
  const download = await dbGet(db.select().from(downloads).where(eq(downloads.id, id)))

  if (!download) {
    throw createError({ statusCode: 404, statusMessage: 'Download not found' })
  }

  if (download.userId !== session.user.id && session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // In 'move' mode the torrent's file *is* the library file until the import
  // moves it out, so asking qBittorrent to delete files would wipe the only
  // complete copy. In 'hardlink'/'copy' modes the staging copy can go: the
  // library copy survives.
  const deleteFiles = await shouldDeleteTorrentFiles(download)

  if (download.torrentHash !== null) {
    const qbit = useQBittorrent()
    // Read the save path before the delete: qBittorrent removes the files but
    // leaves the (now empty) release folders behind, so prune them afterwards.
    const savePath = (await qbit.findTorrentByHash(download.torrentHash).catch(() => undefined))?.save_path ?? ''
    try {
      await qbit.deleteTorrent(download.torrentHash, deleteFiles)
      // qBittorrent drops the torrent from its list before the file delete finishes;
      // wait until it is gone so a quick re-add cannot race the in-progress delete
      for (let i = 0; i < 20; i++) {
        const remaining = await qbit.findTorrentByHash(download.torrentHash).catch(() => undefined)
        if (remaining === undefined) break
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } catch {
      // qBittorrent might be offline
    }

    if (deleteFiles && savePath !== '') {
      const config = useRuntimeConfig()
      const stagingDir = resolveStagingDir(download.savePath, {
        downloadPathMovies: (config.downloadPathMovies as string | undefined) ?? '',
        downloadPathSeries: (config.downloadPathSeries as string | undefined) ?? ''
      })
      if (stagingDir !== null) {
        await pruneStagingUntilGone(savePath, stagingDir).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          log.warn(`staging prune after delete failed: id=${download.id}: ${msg}`)
        })
      }
    }
  }

  await dbRun(db.update(downloads).set({ status: 'removed' }).where(eq(downloads.id, id)))

  await logActivity(event, {
    action: 'torrent_delete',
    userId: session.user.id,
    username: session.user.username,
    details: JSON.stringify({ name: download.torrentName, hash: download.torrentHash, deleteFiles })
  })

  return { success: true }
})
