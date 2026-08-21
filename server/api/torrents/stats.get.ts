import { getReposAsync } from '#server/repositories'
import { syncTorrentStatus } from '#server/utils/torrents/torrent-sync'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // Sync before reading so statuses match what qBittorrent reports
  await syncTorrentStatus().catch(() => {})

  const repos = await getReposAsync()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const sinceIso = todayStart.toISOString()

  // Admin sees fleet-wide stats, regular users see their own
  const filters = session.user.role === 'admin' ? {} : { userId: session.user.id }
  const stats = await repos.downloads.stats(filters, sinceIso)

  return { ...stats, sinceIso }
})
