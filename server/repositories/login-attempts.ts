import { loginAttempts } from '#server/database/schema'
import { eq, and, gt, count } from 'drizzle-orm'
import { dbGet, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { LoginAttempt } from '#server/types/entities'

export interface LoginAttemptRepo {
  countFailedInWindow(ip: string, windowStart: string): Promise<number>
  countByStatus(success: boolean, since: string): Promise<number>
  countTotal(since: string): Promise<number>
  create(data: Omit<LoginAttempt, 'id'> & { id?: string }): Promise<void>
  deleteFailedByIp(ip: string): Promise<void>
  deleteOlderThan(cutoff: string): Promise<void>
}

export function createLoginAttemptRepo(db: SqliteDb): LoginAttemptRepo {
  return {
    async countFailedInWindow(ip, windowStart) {
      const row = await dbGet(
        db
          .select({ cnt: count() })
          .from(loginAttempts)
          .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, windowStart)))
      )
      return row?.cnt ?? 0
    },

    async countByStatus(success, since) {
      const row = await dbGet(
        db.select({ cnt: count() }).from(loginAttempts).where(and(eq(loginAttempts.success, success), gt(loginAttempts.createdAt, since)))
      )
      return row?.cnt ?? 0
    },

    async countTotal(since) {
      const row = await dbGet(db.select({ cnt: count() }).from(loginAttempts).where(gt(loginAttempts.createdAt, since)))
      return row?.cnt ?? 0
    },

    async create(data) {
      const id = data.id ?? crypto.randomUUID()
      await dbRun(db.insert(loginAttempts).values({ ...data, id }))
    },

    async deleteFailedByIp(ip) {
      await dbRun(db.delete(loginAttempts).where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false))))
    },

    async deleteOlderThan(cutoff) {
      await dbRun(db.delete(loginAttempts).where(gt(loginAttempts.createdAt, cutoff)))
    }
  }
}
