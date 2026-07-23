import { eq, desc } from 'drizzle-orm'
import { useDbAsync, dbAll } from '#server/utils/db'
import { requests } from '#server/database/schema'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user || session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : undefined
  const page = Math.max(1, Number(query.page) || 1)
  const limit = 50

  const db = await useDbAsync()

  const conditions =
    status !== null && status !== undefined
      ? eq(requests.status, status as 'pending' | 'accepted' | 'rejected')
      : undefined

  const all = await dbAll(db.select().from(requests).where(conditions).orderBy(desc(requests.createdAt)))

  const total = all.length
  const totalPages = Math.ceil(total / limit)
  const items = all.slice((page - 1) * limit, page * limit)

  return { items, total, totalPages, page }
})
