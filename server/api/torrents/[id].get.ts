import { downloads } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Download ID is required' })
  }

  const db = useDb()
  const download = db.select().from(downloads).where(eq(downloads.id, id)).get()

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
      const completedStates = new Set(['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'])

      if (torrent !== undefined) {
        const progressPct = torrent.progress * 100
        const isComplete =
          torrent.completion_on > 0 ||
          torrent.downloaded >= torrent.size ||
          progressPct >= 99.9 ||
          completedStates.has(torrent.state)

        db.update(downloads)
          .set({
            progress: isComplete ? 100 : progressPct,
            etaSeconds: isComplete ? 0 : torrent.eta,
            downloadSpeed: isComplete ? 0 : torrent.dlspeed,
            uploadSpeed: isComplete ? 0 : torrent.upspeed,
            downloadedBytes: torrent.downloaded,
            status: isComplete ? 'completed' : 'downloading',
            completedAt: isComplete ? new Date().toISOString() : null
          })
          .where(eq(downloads.id, id))
          .run()

        return {
          ...download,
          progress: isComplete ? 100 : progressPct,
          etaSeconds: isComplete ? 0 : torrent.eta,
          downloadSpeed: isComplete ? 0 : torrent.dlspeed,
          uploadSpeed: isComplete ? 0 : torrent.upspeed,
          downloadedBytes: torrent.downloaded,
          status: isComplete ? 'completed' : 'downloading'
        }
      }
    } catch {
      // qBittorrent might be offline, return stored data
    }
  }

  return download
})
