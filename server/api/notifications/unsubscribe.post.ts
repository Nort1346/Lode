import { pushSubscriptions } from '#server/database/schema'
import { and, eq } from 'drizzle-orm'
import type { UnsubscribeBody } from '#server/types/notifications'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<UnsubscribeBody>(event)
  const db = useDb()

  if (body.endpoint !== undefined) {
    db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, session.user.id)))
      .run()
    return { success: true }
  }

  const allSubs = db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, session.user.id))
    .all()

  for (const sub of allSubs) {
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run()
  }

  return { success: true, count: allSubs.length }
})
