import { eq, desc } from 'drizzle-orm'
import { useDb } from '#server/utils/db'
import { requests } from '#server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const db = useDb()

  const items = db
    .select()
    .from(requests)
    .where(eq(requests.userId, session.user.id))
    .orderBy(desc(requests.createdAt))
    .all()

  return { requests: items }
})
