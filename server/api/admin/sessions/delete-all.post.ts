import { sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbRun } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ userId: string }>(event)
  if (!body.userId) throw createError({ statusCode: 400, statusMessage: 'userId required' })

  const db = await useDbAsync()
  await dbRun(db.delete(sessions).where(eq(sessions.userId, body.userId)))
  return { success: true }
})
