import { downloads } from '#server/database/schema'
import { eq, and, desc, count, gte, notInArray } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { DownloadRepo } from '#server/types/repos'

export function createDownloadRepo(db: SqliteDb): DownloadRepo {
  return {
    async findById(id) {
      return dbGet(db.select().from(downloads).where(eq(downloads.id, id)))
    },

    async findActiveByUser(userId) {
      return dbAll(
        db
          .select()
          .from(downloads)
          .where(and(eq(downloads.userId, userId), eq(downloads.status, 'downloading')))
      )
    },

    async findActiveDownloads() {
      return dbAll(db.select().from(downloads).where(eq(downloads.status, 'downloading')))
    },

    async findCompletedDownloads() {
      return dbAll(db.select().from(downloads).where(eq(downloads.status, 'completed')))
    },

    async findByUser(userId) {
      return dbAll(db.select().from(downloads).where(eq(downloads.userId, userId)))
    },

    async findPaginated(filters, page, limit) {
      const conditions = []
      if (filters.userId !== undefined) conditions.push(eq(downloads.userId, filters.userId))
      if (filters.status !== undefined) conditions.push(eq(downloads.status, filters.status))
      const where = conditions.length > 0 ? and(...conditions) : undefined

      let query = db
        .select()
        .from(downloads)
        .orderBy(desc(downloads.createdAt))
        .limit(limit)
        .offset((page - 1) * limit)
      if (where !== undefined) query = query.where(where) as typeof query
      return dbAll(query)
    },

    async countFiltered(filters) {
      const conditions = []
      if (filters.userId !== undefined) conditions.push(eq(downloads.userId, filters.userId))
      if (filters.status !== undefined) conditions.push(eq(downloads.status, filters.status))
      const where = conditions.length > 0 ? and(...conditions) : undefined

      let query = db.select({ count: count() }).from(downloads)
      if (where !== undefined) query = query.where(where) as typeof query
      const [row] = await dbAll(query)
      return row?.count ?? 0
    },

    async countByUserSince(userId, sinceIso, excludeStatuses) {
      const conditions = [eq(downloads.userId, userId), gte(downloads.createdAt, sinceIso)]
      if (excludeStatuses.length > 0) conditions.push(notInArray(downloads.status, excludeStatuses))
      const row = await dbGet(
        db
          .select({ count: count() })
          .from(downloads)
          .where(and(...conditions))
      )
      return row?.count ?? 0
    },

    async create(data) {
      await dbRun(db.insert(downloads).values(data))
    },

    async update(id, data) {
      await dbRun(db.update(downloads).set(data).where(eq(downloads.id, id)))
    }
  }
}
