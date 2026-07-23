import { sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbRun } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  await logActivity(event, {
    action: 'logout',
    userId: session.user?.id,
    username: session.user?.username
  })

  if (session.sessionId !== undefined && session.sessionId !== null) {
    const db = await useDbAsync()
    await dbRun(db.delete(sessions).where(eq(sessions.id, session.sessionId)))
  }

  await clearUserSession(event)
  return { success: true }
})
