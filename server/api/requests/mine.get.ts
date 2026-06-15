import { eq, and } from 'drizzle-orm'
import { useDb } from '../../utils/db'
import { requests } from '../../database/schema'

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

  const db = useDb()

  const existing = db
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.userId, session.user.id),
        eq(requests.mediaType, mediaType as 'movie' | 'tv'),
        eq(requests.mediaId, mediaId),
        eq(requests.status, 'pending')
      )
    )
    .get()

  return { requested: !!existing }
})
