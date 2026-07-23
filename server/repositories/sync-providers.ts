import { syncProviders } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { SyncProvider } from '#server/types/entities'

export interface SyncProviderRepo {
  findUserProvider(userId: string, providerName: string): Promise<SyncProvider | undefined>
  findByUser(userId: string): Promise<SyncProvider[]>
  create(data: Omit<SyncProvider, 'lastSyncError'>): Promise<void>
  updateStatus(userId: string, providerName: string, status: 'synced' | 'pending' | 'failed', error?: string): Promise<void>
  deleteByUser(userId: string): Promise<void>
}

export function createSyncProviderRepo(db: SqliteDb): SyncProviderRepo {
  return {
    async findUserProvider(userId, providerName) {
      return dbGet(
        db.select().from(syncProviders).where(and(eq(syncProviders.userId, userId), eq(syncProviders.providerName, providerName)))
      )
    },

    async findByUser(userId) {
      return dbAll(db.select().from(syncProviders).where(eq(syncProviders.userId, userId)))
    },

    async create(data) {
      await dbRun(db.insert(syncProviders).values(data))
    },

    async updateStatus(userId, providerName, status, error) {
      await dbRun(
        db
          .update(syncProviders)
          .set({ syncStatus: status, lastSyncError: error ?? null, updatedAt: new Date().toISOString() })
          .where(and(eq(syncProviders.userId, userId), eq(syncProviders.providerName, providerName)))
      )
    },

    async deleteByUser(userId) {
      await dbRun(db.delete(syncProviders).where(eq(syncProviders.userId, userId)))
    }
  }
}
