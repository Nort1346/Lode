import { downloads, users } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const db = useDb()
  const user = db.select().from(users).where(eq(users.id, session.user.id)).get()
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayAll = db
    .select()
    .from(downloads)
    .where(eq(downloads.userId, session.user.id))
    .all()
    .filter((d) => new Date(d.createdAt) >= todayStart)

  const todayPrivate = todayAll.filter((d) => d.isPrivate).length

  const todayActive = todayAll.filter((d) => d.status !== 'failed' && d.status !== 'removed')

  return {
    todayPrivate,
    privateLimit: user.privateTrackerLimit,
    dailyUsed: todayActive.length,
    dailyLimit: user.dailyDownloadLimit
  }
})
