import { customTrackers } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined || id === '') {
    throw createError({ statusCode: 400, statusMessage: 'Tracker ID is required' })
  }

  const db = useDb()
  const existing = db.select().from(customTrackers).where(eq(customTrackers.id, id)).get()
  if (existing === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'Tracker not found' })
  }

  db.delete(customTrackers).where(eq(customTrackers.id, id)).run()

  logActivity(event, {
    action: 'tracker_delete',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({ indexerName: existing.indexerName })
  })

  return { success: true }
})
