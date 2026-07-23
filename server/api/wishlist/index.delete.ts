import { wishlist } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = (await readBody(event)) as { id?: string; mediaType?: string; mediaId?: number }
  const db = await useDbAsync()

  if (body.id !== undefined && body.id !== null && body.id.length > 0) {
    const item = await dbGet(db.select().from(wishlist).where(eq(wishlist.id, body.id)))
    if (!item || item.userId !== session.user.id) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
    await dbRun(db.delete(wishlist).where(eq(wishlist.id, body.id)))
    return { success: true }
  }

  if (
    body.mediaType !== undefined &&
    body.mediaType !== null &&
    body.mediaId !== undefined &&
    body.mediaId !== null &&
    body.mediaId > 0
  ) {
    await dbRun(
      db
        .delete(wishlist)
        .where(
          and(
            eq(wishlist.userId, session.user.id),
            eq(wishlist.mediaType, body.mediaType as 'movie' | 'tv'),
            eq(wishlist.mediaId, body.mediaId)
          )
        )
    )
    return { success: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'Missing id or mediaType/mediaId' })
})
