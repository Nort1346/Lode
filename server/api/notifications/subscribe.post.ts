import { randomUUID } from 'node:crypto'
import { pushSubscriptions } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import type { SubscribeBody } from '#server/types/notifications'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<SubscribeBody>(event)
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid subscription' })
  }

  const db = await useDbAsync()
  const ua = getRequestHeader(event, 'user-agent') ?? null
  const now = new Date().toISOString()

  const existing = await dbGet(
    db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, session.user.id)))
  )

  if (existing !== undefined) {
    await dbRun(db.update(pushSubscriptions).set({ lastUsedAt: now }).where(eq(pushSubscriptions.id, existing.id)))
    return { success: true, id: existing.id }
  }

  const id = randomUUID()
  await dbRun(
    db.insert(pushSubscriptions).values({
      id,
      userId: session.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: ua,
      createdAt: now,
      lastUsedAt: now
    })
  )

  return { success: true, id }
})
