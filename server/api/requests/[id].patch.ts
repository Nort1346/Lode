import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import { requests } from '#server/database/schema'
import { notifyRequestStatus } from '#server/utils/notifications'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user || session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Missing request ID' })
  }

  const body = (await readBody(event)) as { status: string; adminNote?: string }
  const { status, adminNote: rawAdminNote } = body

  if (status !== 'accepted' && status !== 'rejected') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }

  const adminNote =
    rawAdminNote !== null && rawAdminNote !== undefined ? rawAdminNote.replace(/\n/g, ' ').trim().slice(0, 255) : null

  const db = await useDbAsync()

  const existing = await dbGet(db.select().from(requests).where(eq(requests.id, id)))
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Request not found' })
  }

  await dbRun(
    db
      .update(requests)
      .set({
        status: status as 'accepted' | 'rejected',
        adminNote: adminNote ?? null,
        updatedAt: new Date().toISOString()
      })
      .where(eq(requests.id, id))
  )

  if (status === 'accepted' || status === 'rejected') {
    await notifyRequestStatus(
      existing.userId,
      id,
      status,
      existing.mediaType as 'movie' | 'tv',
      existing.mediaId,
      existing.mediaTitle,
      existing.mediaPoster,
      adminNote
    )
  }

  return { success: true }
})
