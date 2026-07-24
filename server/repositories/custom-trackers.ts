import { customTrackers } from '#server/database/schema'
import { eq, and, ne } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { CustomTrackerRepo } from '#server/types/repos'

export function createCustomTrackerRepo(db: SqliteDb): CustomTrackerRepo {
  return {
    async findById(id) {
      return dbGet(db.select().from(customTrackers).where(eq(customTrackers.id, id)))
    },

    async findByIndexerName(name) {
      return dbGet(db.select().from(customTrackers).where(eq(customTrackers.indexerName, name)))
    },

    async findAll() {
      return dbAll(db.select().from(customTrackers))
    },

    async findEnabled() {
      return dbAll(db.select().from(customTrackers).where(eq(customTrackers.enabled, true)))
    },

    async checkNameUnique(name, excludeId) {
      const existing = await dbGet(
        db
          .select({ id: customTrackers.id })
          .from(customTrackers)
          .where(and(eq(customTrackers.indexerName, name), ne(customTrackers.id, excludeId)))
      )
      return existing === undefined
    },

    async create(data) {
      await dbRun(db.insert(customTrackers).values(data))
    },

    async update(id, data) {
      await dbRun(db.update(customTrackers).set(data).where(eq(customTrackers.id, id)))
    },

    async delete(id) {
      await dbRun(db.delete(customTrackers).where(eq(customTrackers.id, id)))
    }
  }
}
