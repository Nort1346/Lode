import { downloads } from '../../database/schema'
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
      const qui = useQui()
      await qui.deleteTorrent(download.torrentHash, true)
    } catch {
      // qui might be offline
    }
  }

  db.update(downloads).set({ status: 'removed' }).where(eq(downloads.id, id)).run()

  logActivity(event, {
    action: 'torrent_delete',
    userId: session.user.id,
    username: session.user.username,
    details: JSON.stringify({ name: download.torrentName, hash: download.torrentHash })
  })

  return { success: true }
})
