import { eq, and } from 'drizzle-orm'
import { useDb } from '#server/utils/db'
import { requests } from '#server/database/schema'

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

  const db = useDb()

  const existing = db
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.userId, session.user.id),
        eq(requests.mediaType, mediaType),
        eq(requests.mediaId, mediaId),
        eq(requests.status, 'pending')
      )
    )
    .get()

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Already requested' })
  }

  const id = crypto.randomUUID()

  db.insert(requests)
    .values({
      id,
      userId: session.user.id,
      username: session.user.username,
      mediaType,
      mediaId,
      mediaTitle,
      mediaPoster: mediaPoster ?? null,
      status: 'pending',
      createdAt: new Date().toISOString()
    })
    .run()

  return { success: true }
})
