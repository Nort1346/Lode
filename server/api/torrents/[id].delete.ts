import { downloads } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'

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
      await qbit.deleteTorrent(download.torrentHash, true)
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
  }

  await dbRun(db.update(downloads).set({ status: 'removed' }).where(eq(downloads.id, id)))

  await logActivity(event, {
    action: 'torrent_delete',
    userId: session.user.id,
    username: session.user.username,
    details: JSON.stringify({ name: download.torrentName, hash: download.torrentHash })
  })

  return { success: true }
})
