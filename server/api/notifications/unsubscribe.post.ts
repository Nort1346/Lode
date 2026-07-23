import { pushSubscriptions } from '#server/database/schema'
import { and, eq } from 'drizzle-orm'
import { useDbAsync, dbAll, dbRun } from '#server/utils/db'
import type { UnsubscribeBody } from '#server/types/notifications'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<UnsubscribeBody>(event)
  const db = await useDbAsync()

  if (body.endpoint !== undefined) {
    await dbRun(
      db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, session.user.id)))
    )
    return { success: true }
  }

  const allSubs = await dbAll(
    db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, session.user.id))
  )

  for (const sub of allSubs) {
    await dbRun(db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)))
  }

  return { success: true, count: allSubs.length }
})
