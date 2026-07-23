import { sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbRun } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (id === undefined || id === null) throw createError({ statusCode: 400, statusMessage: 'Session ID required' })

  const db = await useDbAsync()
  await dbRun(db.delete(sessions).where(eq(sessions.id, id)))
  return { success: true }
})
