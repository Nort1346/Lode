import { customTrackers } from '#server/database/schema'
import { eq, and, ne } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { CustomTracker } from '#server/types/entities'

export interface CustomTrackerRepo {
  findById(id: string): Promise<CustomTracker | undefined>
  findByIndexerName(name: string): Promise<CustomTracker | undefined>
  findAll(): Promise<CustomTracker[]>
  findEnabled(): Promise<CustomTracker[]>
  checkNameUnique(name: string, excludeId: string): Promise<boolean>
  create(data: Omit<CustomTracker, 'enabled'> & { enabled?: boolean }): Promise<void>
  update(id: string, data: Partial<Omit<CustomTracker, 'id'>>): Promise<void>
  delete(id: string): Promise<void>
}

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
