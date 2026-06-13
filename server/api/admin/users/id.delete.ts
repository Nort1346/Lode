import { users } from '../../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const db = useDb()
  const user = db.select().from(users).where(eq(users.id, id)).get()
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  if (user.role === 'admin') {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete admin users' })
  }

  db.delete(users).where(eq(users.id, id)).run()

  return { success: true }
})
