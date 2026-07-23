import { syncUserSettings } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { dbGet, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { SyncUserSettings } from '#server/types/entities'

export interface SyncUserSettingsRepo {
  find(userId: string, providerName: string): Promise<SyncUserSettings | undefined>
  upsert(
    userId: string,
    providerName: string,
    settings: Omit<SyncUserSettings, 'id' | 'userId' | 'providerName' | 'createdAt' | 'updatedAt'>
  ): Promise<void>
  deleteByUser(userId: string): Promise<void>
}

export function createSyncUserSettingsRepo(db: SqliteDb): SyncUserSettingsRepo {
  return {
    async find(userId, providerName) {
      return dbGet(
        db
          .select()
          .from(syncUserSettings)
          .where(and(eq(syncUserSettings.userId, userId), eq(syncUserSettings.providerName, providerName)))
      )
    },

    async upsert(userId, providerName, settings) {
      const existing = await dbGet(
        db
          .select()
          .from(syncUserSettings)
          .where(and(eq(syncUserSettings.userId, userId), eq(syncUserSettings.providerName, providerName)))
      )

      const now = new Date().toISOString()

      if (existing) {
        await dbRun(
          db
            .update(syncUserSettings)
            .set({ ...settings, updatedAt: now })
            .where(eq(syncUserSettings.id, existing.id))
        )
      } else {
        await dbRun(
          db
            .insert(syncUserSettings)
            .values({ id: crypto.randomUUID(), userId, providerName, ...settings, createdAt: now, updatedAt: now })
        )
      }
    },

    async deleteByUser(userId) {
      await dbRun(db.delete(syncUserSettings).where(eq(syncUserSettings.userId, userId)))
    }
  }
}
