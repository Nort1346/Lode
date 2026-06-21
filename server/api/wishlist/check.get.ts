import { wishlist } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const mediaType = typeof query.mediaType === 'string' ? query.mediaType : undefined
  const mediaId = typeof query.mediaId === 'string' ? Number(query.mediaId) : undefined

  if (mediaType === undefined || mediaId === undefined || mediaId === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Missing mediaType or mediaId' })
  }

  const db = useDb()

  const existing = db
    .select()
    .from(wishlist)
    .where(
      and(
        eq(wishlist.userId, session.user.id),
        eq(wishlist.mediaType, mediaType as 'movie' | 'tv'),
        eq(wishlist.mediaId, mediaId)
      )
    )
    .get()

  return { wishlisted: !!existing, id: existing?.id ?? null }
})
