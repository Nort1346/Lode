import { eq } from 'drizzle-orm'
import { useDb } from '#server/utils/db'
import { requests } from '#server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user || session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Missing request ID' })
  }

  const body = (await readBody(event)) as { status: string; note?: string }
  const { status, note } = body

  if (status !== 'accepted' && status !== 'rejected') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status' })
  }

  const db = useDb()

  const existing = db.select().from(requests).where(eq(requests.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Request not found' })
  }

  db.update(requests)
    .set({ status: status as 'accepted' | 'rejected', note: note ?? null })
    .where(eq(requests.id, id))
    .run()

  return { success: true }
})
