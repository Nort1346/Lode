import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const db = await useDbAsync()
  const user = await dbGet(db.select().from(users).where(eq(users.id, session.user.id)))

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    canSubmit: user.canSubmit,
    dailyDownloadLimit: user.dailyDownloadLimit,
    activeTorrentLimit: user.activeTorrentLimit,
    maxTorrentSizeGb: user.maxTorrentSizeGb,
    privateTrackerLimit: user.privateTrackerLimit,
    downloadsToday: user.downloadsToday,
    avatarUrl: user.avatarUrl
  }
})
