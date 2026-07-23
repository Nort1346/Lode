import { users } from '#server/database/schema'
import { eq, and, lte, isNotNull } from 'drizzle-orm'
import { dbGet, dbAll, dbRun } from '#server/utils/db'
import type { SqliteDb } from '#server/types/database'
import type { User, CreateUserInput, UpdateUserInput } from '#server/types/entities'

export interface UserRepo {
  findById(id: string): Promise<User | undefined>
  findByUsername(username: string): Promise<User | undefined>
  findByRole(role: 'admin' | 'user'): Promise<User[]>
  findAll(): Promise<User[]>
  findExpiredUsers(now: string): Promise<{ id: string; username: string }[]>
  create(data: CreateUserInput): Promise<void>
  update(id: string, data: UpdateUserInput): Promise<void>
  delete(id: string): Promise<void>
}

export function createUserRepo(db: SqliteDb): UserRepo {
  return {
    async findById(id) {
      return dbGet(db.select().from(users).where(eq(users.id, id)))
    },

    async findByUsername(username) {
      return dbGet(db.select().from(users).where(eq(users.username, username)))
    },

    async findByRole(role) {
      return dbAll(db.select().from(users).where(eq(users.role, role)))
    },

    async findAll() {
      return dbAll(db.select().from(users))
    },

    async findExpiredUsers(now) {
      return dbAll(
        db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(
            and(isNotNull(users.expiresAt), lte(users.expiresAt, now), eq(users.isActive, true), eq(users.role, 'user'))
          )
      )
    },

    async create(data) {
      await dbRun(db.insert(users).values(data))
    },

    async update(id, data) {
      await dbRun(db.update(users).set(data).where(eq(users.id, id)))
    },

    async delete(id) {
      await dbRun(db.delete(users).where(eq(users.id, id)))
    }
  }
}
