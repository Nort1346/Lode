import { activityLogs } from '#server/database/schema'
import { eq, lt, desc, count, and } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { ActivityLog } from '#server/types/entities'

export interface ActivityLogRepo {
  countFiltered(filters: { userId?: string; action?: string }): Promise<number>
  findPaginated(filters: { userId?: string; action?: string }, page: number, limit: number): Promise<ActivityLog[]>
  create(data: Omit<ActivityLog, 'id'> & { id?: string }): Promise<void>
  deleteOlderThan(cutoff: string): Promise<void>
}

export function createActivityLogRepo(db: SqliteDb): ActivityLogRepo {
  return {
    async countFiltered(filters) {
      const conditions = []
      if (filters.userId !== undefined) conditions.push(eq(activityLogs.userId, filters.userId))
      if (filters.action !== undefined) conditions.push(eq(activityLogs.action, filters.action))
      const where = conditions.length > 0 ? and(...conditions) : undefined

      let query = db.select({ count: count() }).from(activityLogs)
      if (where !== undefined) query = query.where(where) as typeof query
      const [row] = await dbAll(query)
      return row?.count ?? 0
    },

    async findPaginated(filters, page, limit) {
      const conditions = []
      if (filters.userId !== undefined) conditions.push(eq(activityLogs.userId, filters.userId))
      if (filters.action !== undefined) conditions.push(eq(activityLogs.action, filters.action))
      const where = conditions.length > 0 ? and(...conditions) : undefined

      let query = db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit).offset((page - 1) * limit)
      if (where !== undefined) query = query.where(where) as typeof query
      return dbAll(query)
    },

    async create(data) {
      const id = data.id ?? crypto.randomUUID()
      await dbRun(db.insert(activityLogs).values({ ...data, id }))
    },

    async deleteOlderThan(cutoff) {
      await dbRun(db.delete(activityLogs).where(lt(activityLogs.createdAt, cutoff)))
    }
  }
}
