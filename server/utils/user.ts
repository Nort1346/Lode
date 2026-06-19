import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export function getFreshUser(userId: string) {
  const db = useDb()
  return db.select().from(users).where(eq(users.id, userId)).get()
}
