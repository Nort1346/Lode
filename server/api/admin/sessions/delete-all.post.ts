import { sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ userId: string }>(event)
  if (!body.userId) throw createError({ statusCode: 400, statusMessage: 'userId required' })

  const db = useDb()
  db.delete(sessions).where(eq(sessions.userId, body.userId)).run()
  return { success: true }
})
