import { requests } from '#server/database/schema'
import { eq, and, desc } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { Request as DbRequest } from '#server/types/entities'

export interface RequestRepo {
  findById(id: string): Promise<DbRequest | undefined>
  findByUser(userId: string): Promise<DbRequest[]>
  findDuplicate(userId: string, mediaType: 'movie' | 'tv', mediaId: number): Promise<DbRequest | undefined>
  findPaginated(status?: 'pending' | 'accepted' | 'rejected'): Promise<DbRequest[]>
  create(data: Omit<DbRequest, 'status' | 'adminNote' | 'updatedAt'>): Promise<void>
  updateStatus(id: string, status: 'accepted' | 'rejected', adminNote: string | null, updatedAt: string): Promise<void>
}

export function createRequestRepo(db: SqliteDb): RequestRepo {
  return {
    async findById(id) {
      return dbGet(db.select().from(requests).where(eq(requests.id, id)))
    },

    async findByUser(userId) {
      return dbAll(db.select().from(requests).where(eq(requests.userId, userId)).orderBy(desc(requests.createdAt)))
    },

    async findDuplicate(userId, mediaType, mediaId) {
      return dbGet(
        db
          .select()
          .from(requests)
          .where(and(eq(requests.userId, userId), eq(requests.mediaType, mediaType), eq(requests.mediaId, mediaId)))
      )
    },

    async findPaginated(status) {
      const where = status !== undefined ? eq(requests.status, status) : undefined
      let query = db.select().from(requests).orderBy(desc(requests.createdAt))
      if (where !== undefined) query = query.where(where) as typeof query
      return dbAll(query)
    },

    async create(data) {
      await dbRun(db.insert(requests).values({ ...data, status: 'pending' as const }))
    },

    async updateStatus(id, status, adminNote, updatedAt) {
      await dbRun(db.update(requests).set({ status, adminNote, updatedAt }).where(eq(requests.id, id)))
    }
  }
}
