import { activityLogs } from '../../database/schema'
import { desc, eq, and, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const rawPage = query.page
  const rawLimit = query.limit
  const rawAction = query.action
  const rawUserId = query.userId

  const page = typeof rawPage === 'string' ? Math.max(1, Number.parseInt(rawPage, 10) || 1) : 1
  const limit = typeof rawLimit === 'string' ? Math.min(100, Math.max(1, Number.parseInt(rawLimit, 10) || 50)) : 50
  const offset = (page - 1) * limit
  const action = typeof rawAction === 'string' && rawAction.length > 0 ? rawAction : undefined
  const userId = typeof rawUserId === 'string' && rawUserId.length > 0 ? rawUserId : undefined

  const db = useDb()

  const conditions = []
  if (action !== undefined) {
    conditions.push(eq(activityLogs.action, action))
  }
  if (userId !== undefined) {
    conditions.push(eq(activityLogs.userId, userId))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(activityLogs)
    .where(where)
    .get()

  const total = countResult?.count ?? 0
  const totalPages = Math.ceil(total / limit)

  const logs = db
    .select()
    .from(activityLogs)
    .where(where)
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit)
    .offset(offset)
    .all()

  return { logs, page, totalPages, total }
})
