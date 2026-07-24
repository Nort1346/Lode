import { sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { SessionRepo } from '#server/types/repos'

export function createSessionRepo(db: SqliteDb): SessionRepo {
  return {
    async findById(id) {
      return dbGet(db.select().from(sessions).where(eq(sessions.id, id)))
    },

    async findUserSessions(userId) {
      return dbAll(
        db.select({ id: sessions.id, createdAt: sessions.createdAt }).from(sessions).where(eq(sessions.userId, userId))
      )
    },

    async create(data) {
      await dbRun(db.insert(sessions).values(data))
    },

    async touch(id, now) {
      await dbRun(db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.id, id)))
    },

    async delete(id) {
      await dbRun(db.delete(sessions).where(eq(sessions.id, id)))
    },

    async deleteByUser(userId) {
      await dbRun(db.delete(sessions).where(eq(sessions.userId, userId)))
    }
  }
}
