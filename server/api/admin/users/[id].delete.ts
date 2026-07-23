import { users, sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncUserDelete } from '#server/utils/sync'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const db = await useDbAsync()
  const user = await dbGet(db.select().from(users).where(eq(users.id, id)))
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  if (user.role === 'admin') {
    throw createError({ statusCode: 400, statusMessage: 'Cannot delete admin users' })
  }

  // CRITICAL: Delete from Jellyfin FIRST, then from StreamHub
  try {
    await syncUserDelete(id)
  } catch (error) {
    console.error('[User] Jellyfin delete failed:', error)
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to delete user from Jellyfin. User not deleted.'
    })
  }

  await dbRun(db.delete(users).where(eq(users.id, id)))

  // SECURITY: delete all active sessions for the user so a deleted user
  // cannot keep using an existing session to access the app
  await dbRun(db.delete(sessions).where(eq(sessions.userId, id)))

  await logActivity(event, {
    action: 'user_delete',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ targetUser: user.username, targetUserId: id })
  })

  return { success: true }
})
