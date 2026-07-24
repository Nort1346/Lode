import { pushSubscriptions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { PushSubscriptionRepo } from '#server/types/repos'

export function createPushSubscriptionRepo(db: SqliteDb): PushSubscriptionRepo {
  return {
    async findByUser(userId) {
      return dbAll(db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)))
    },

    async findByEndpoint(endpoint) {
      return dbGet(db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)))
    },

    async create(data) {
      await dbRun(db.insert(pushSubscriptions).values(data))
    },

    async delete(id) {
      await dbRun(db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)))
    }
  }
}
