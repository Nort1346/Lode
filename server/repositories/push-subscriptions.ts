import { pushSubscriptions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { PushSubscription } from '#server/types/entities'

export interface PushSubscriptionRepo {
  findByUser(userId: string): Promise<PushSubscription[]>
  findByEndpoint(endpoint: string): Promise<PushSubscription | undefined>
  create(data: Omit<PushSubscription, 'lastUsedAt'>): Promise<void>
  delete(id: string): Promise<void>
}

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
