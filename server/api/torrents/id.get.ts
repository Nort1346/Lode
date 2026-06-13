import { downloads } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
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

  if (download.torrentHash) {
    try {
      const qui = useQui()
      const torrents = await qui.getUserTorrents(session.user.username)
      const torrent = torrents.find(t => t.hash === download.torrentHash)

      if (torrent) {
        db.update(downloads).set({
          progress: Math.round(torrent.progress * 100),
          etaSeconds: torrent.eta,
          downloadSpeed: torrent.dlspeed,
          uploadSpeed: torrent.upspeed,
          downloadedBytes: torrent.downloaded,
          status: torrent.progress >= 1 ? 'completed' : 'downloading'
        }).where(eq(downloads.id, id)).run()

        return {
          ...download,
          progress: Math.round(torrent.progress * 100),
          etaSeconds: torrent.eta,
          downloadSpeed: torrent.dlspeed,
          uploadSpeed: torrent.upspeed,
          downloadedBytes: torrent.downloaded,
          status: torrent.progress >= 1 ? 'completed' : 'downloading'
        }
      }
    } catch {
      // qui might be offline, return stored data
    }
  }

  return download
})
