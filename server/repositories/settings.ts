import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { dbGet, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { SettingRepo } from '#server/types/repos'

export function createSettingRepo(db: SqliteDb): SettingRepo {
  return {
    async get(key) {
      const row = await dbGet(db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)))
      return row?.value
    },

    async set(key, value) {
      const existing = await dbGet(db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)))
      if (existing !== undefined) {
        await dbRun(db.update(settings).set({ value }).where(eq(settings.key, key)))
      } else {
        await dbRun(db.insert(settings).values({ key, value }))
      }
    },

    async delete(key) {
      await dbRun(db.delete(settings).where(eq(settings.key, key)))
    }
  }
}
