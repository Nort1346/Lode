import { syncUserSettings } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { dbGet, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { SyncUserSettingsRepo } from '#server/types/repos'

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
      const now = new Date().toISOString()
      await dbRun(
        db
          .insert(syncUserSettings)
          .values({ id: crypto.randomUUID(), userId, providerName, ...settings, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: [syncUserSettings.userId, syncUserSettings.providerName],
            set: { ...settings, updatedAt: now }
          })
      )
    },

    async deleteByUser(userId) {
      await dbRun(db.delete(syncUserSettings).where(eq(syncUserSettings.userId, userId)))
    }
  }
}
