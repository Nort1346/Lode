import { eq, and } from 'drizzle-orm'
import { requests } from '#server/database/schema'
import { notifyRequestPending } from '#server/utils/discord'

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
    userNote?: string | null
  }
  const { mediaType, mediaId, mediaTitle, mediaPoster, userNote: rawUserNote } = body

  if (!mediaType || !mediaId || !mediaTitle) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid media type' })
  }

  const userNote =
    rawUserNote !== null && rawUserNote !== undefined ? rawUserNote.replace(/\n/g, ' ').trim().slice(0, 255) : null

  const db = useDb()

  const existing = db
    .select()
    .from(requests)
    .where(and(eq(requests.userId, session.user.id), eq(requests.mediaType, mediaType), eq(requests.mediaId, mediaId)))
    .get()

  if (existing) {
    if (existing.status === 'pending') {
      throw createError({ statusCode: 409, statusMessage: 'Already requested' })
    }
    if (existing.status === 'accepted') {
      throw createError({ statusCode: 409, statusMessage: 'Already accepted' })
    }
    throw createError({ statusCode: 409, statusMessage: 'Request was rejected' })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.insert(requests)
    .values({
      id,
      userId: session.user.id,
      username: session.user.username,
      mediaType,
      mediaId,
      mediaTitle,
      mediaPoster: mediaPoster ?? null,
      userNote: userNote ?? null,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    })
    .run()

  notifyRequestPending({
    id,
    mediaType: mediaType as 'movie' | 'tv',
    mediaId,
    mediaTitle,
    mediaPoster: mediaPoster ?? null,
    username: session.user.username,
    userNote: userNote ?? null
  }).catch(() => {})

  return { success: true }
})
