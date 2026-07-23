import { wishlist } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = (await readBody(event)) as {
    mediaType: string
    mediaId: number
    mediaTitle: string
    mediaPoster?: string | null
  }
  const { mediaType, mediaId, mediaTitle, mediaPoster } = body

  if (!mediaType || !mediaId || !mediaTitle) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid media type' })
  }

  const db = await useDbAsync()

  const existing = await dbGet(
    db
      .select()
      .from(wishlist)
      .where(
        and(eq(wishlist.userId, session.user.id), eq(wishlist.mediaType, mediaType), eq(wishlist.mediaId, mediaId))
      )
  )

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Already in wishlist' })
  }

  const id = crypto.randomUUID()

  await dbRun(
    db.insert(wishlist).values({
      id,
      userId: session.user.id,
      mediaType,
      mediaId,
      mediaTitle,
      mediaPoster: mediaPoster ?? null,
      createdAt: new Date().toISOString()
    })
  )

  return { success: true, id }
})
