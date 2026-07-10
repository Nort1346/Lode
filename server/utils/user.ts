import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDb } from '#server/utils/db'

export function getFreshUser(userId: string) {
  const db = useDb()
  return db.select().from(users).where(eq(users.id, userId)).get()
}
