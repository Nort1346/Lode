import { wishlist } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbAll } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const db = await useDbAsync()
  const items = await dbAll(db.select().from(wishlist).where(eq(wishlist.userId, session.user.id)))

  return { items }
})
