import { notifications } from '#server/database/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { Notification } from '#server/types/entities'

export interface NotificationRepo {
  findExistingUnread(userId: string, type: string): Promise<{ id: string } | undefined>
  findByUser(userId: string, limit: number): Promise<Notification[]>
  countUnread(userId: string): Promise<number>
  create(data: Omit<Notification, 'read'>): Promise<void>
  updateExisting(id: string, title: string, message: string, createdAt: string): Promise<void>
  markRead(id: string, userId: string): Promise<{ changes: number }>
  markAllRead(userId: string): Promise<{ changes: number }>
}

export function createNotificationRepo(db: SqliteDb): NotificationRepo {
  return {
    async findExistingUnread(userId, type) {
      return dbGet(
        db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.type, type), eq(notifications.read, false)))
      )
    },

    async findByUser(userId, limit) {
      return dbAll(
        db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, userId))
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
      )
    },

    async countUnread(userId) {
      const [row] = await dbAll(
        db
          .select({ count: count() })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      )
      return row?.count ?? 0
    },

    async create(data) {
      await dbRun(db.insert(notifications).values(data))
    },

    async updateExisting(id, title, message, createdAt) {
      await dbRun(db.update(notifications).set({ title, message, createdAt }).where(eq(notifications.id, id)))
    },

    async markRead(id, userId) {
      return dbRun(
        db
          .update(notifications)
          .set({ read: true })
          .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      )
    },

    async markAllRead(userId) {
      return dbRun(
        db
          .update(notifications)
          .set({ read: true })
          .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      )
    }
  }
}
