import { downloads } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import { COMPLETED_STATES, PAUSED_DOWNLOAD_STATES } from '#server/types/torrent'
import { normalizeEta } from '#server/utils/torrents/eta'

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

  if (download.torrentHash !== null) {
    try {
      const qbit = useQBittorrent()
      const torrent = await qbit.findTorrentByHash(download.torrentHash)

      if (torrent !== undefined) {
        const progressPct = torrent.progress * 100
        const isComplete =
          torrent.completion_on > 0 ||
          torrent.downloaded >= torrent.size ||
          progressPct >= 99.9 ||
          COMPLETED_STATES.has(torrent.state)
        const isPaused = !isComplete && PAUSED_DOWNLOAD_STATES.has(torrent.state)

        await dbRun(
          db
            .update(downloads)
            .set({
              progress: isComplete ? 100 : progressPct,
              etaSeconds: isComplete || isPaused ? 0 : normalizeEta(torrent.eta),
              downloadSpeed: isComplete || isPaused ? 0 : torrent.dlspeed,
              uploadSpeed: isComplete || isPaused ? 0 : torrent.upspeed,
              downloadedBytes: torrent.downloaded,
              status: isComplete ? 'completed' : isPaused ? 'paused' : 'downloading',
              completedAt: isComplete ? new Date().toISOString() : null
            })
            .where(eq(downloads.id, id))
        )

        return {
          ...download,
          progress: isComplete ? 100 : progressPct,
          etaSeconds: isComplete || isPaused ? 0 : normalizeEta(torrent.eta),
          downloadSpeed: isComplete || isPaused ? 0 : torrent.dlspeed,
          uploadSpeed: isComplete || isPaused ? 0 : torrent.upspeed,
          downloadedBytes: torrent.downloaded,
          status: isComplete ? 'completed' : isPaused ? 'paused' : 'downloading'
        }
      }
    } catch {
      // qBittorrent might be offline, return stored data
    }
  }

  return download
})
