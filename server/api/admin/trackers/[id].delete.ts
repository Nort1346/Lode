import { customTrackers } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined || id === '') {
    throw createError({ statusCode: 400, statusMessage: 'Tracker ID is required' })
  }

  const db = await useDbAsync()
  const existing = await dbGet(db.select().from(customTrackers).where(eq(customTrackers.id, id)))
  if (existing === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'Tracker not found' })
  }

  await dbRun(db.delete(customTrackers).where(eq(customTrackers.id, id)))

  await logActivity(event, {
    action: 'tracker_delete',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({ indexerName: existing.indexerName })
  })

  return { success: true }
})
