import { sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  logActivity(event, {
    action: 'logout',
    userId: session.user?.id,
    username: session.user?.username
  })

  if (session.sessionId !== undefined && session.sessionId !== null) {
    const db = useDb()
    db.delete(sessions).where(eq(sessions.id, session.sessionId)).run()
  }

  await clearUserSession(event)
  return { success: true }
})
