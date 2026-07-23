import { eq, and, desc } from 'drizzle-orm'
import { useDbAsync, dbGet } from '#server/utils/db'
import { requests } from '#server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const mediaType = typeof query.mediaType === 'string' ? query.mediaType : undefined
  const mediaId = typeof query.mediaId === 'string' ? Number(query.mediaId) : undefined

  if (mediaType === null || mediaType === undefined || mediaId === null || mediaId === undefined || mediaId === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Missing mediaType or mediaId' })
  }

  const db = await useDbAsync()

  const existing = await dbGet(
    db
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.userId, session.user.id),
          eq(requests.mediaType, mediaType as 'movie' | 'tv'),
          eq(requests.mediaId, mediaId)
        )
      )
      .orderBy(desc(requests.createdAt))
  )

  if (!existing) {
    return { status: null, adminNote: null }
  }

  return { status: existing.status, adminNote: existing.adminNote ?? null }
})
