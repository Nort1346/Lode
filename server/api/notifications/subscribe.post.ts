import { randomUUID } from 'node:crypto'
import { pushSubscriptions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
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

  const db = useDb()
  const ua = getRequestHeader(event, 'user-agent') ?? null
  const now = new Date().toISOString()

  const existing = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint)).get()

  if (existing !== undefined) {
    db.update(pushSubscriptions)
      .set({ userId: session.user.id, lastUsedAt: now })
      .where(eq(pushSubscriptions.id, existing.id))
      .run()
    return { success: true, id: existing.id }
  }

  const id = randomUUID()
  db.insert(pushSubscriptions)
    .values({
      id,
      userId: session.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: ua,
      createdAt: now,
      lastUsedAt: now
    })
    .run()

  return { success: true, id }
})
