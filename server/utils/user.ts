import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet } from '#server/utils/db'

export async function getFreshUser(userId: string): Promise<typeof users.$inferSelect | undefined> {
  const db = await useDbAsync()
  return dbGet(db.select().from(users).where(eq(users.id, userId)))
}
