import { hash, compare } from '@node-rs/bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncUserUpdate, getSyncUserSettings, getProviderUserId } from '#server/utils/sync'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import { createLogger } from '#server/utils/logger'

const log = createLogger('Password')

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody<{ currentPassword: string; newPassword: string }>(event)

  if (!body?.currentPassword || !body?.newPassword) {
    throw createError({ statusCode: 400, statusMessage: 'Current and new password are required' })
  }

  if (body.newPassword.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'New password must be at least 8 characters' })
  }

  if (body.currentPassword === body.newPassword) {
    throw createError({ statusCode: 400, statusMessage: 'New password must differ from current' })
  }

  const db = await useDbAsync()
  const user = await dbGet(db.select().from(users).where(eq(users.id, session.user.id)))

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const valid = await compare(body.currentPassword, user.password)
  if (!valid) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid current password' })
  }

  const hashedPassword = await hash(body.newPassword, 12)
  await dbRun(db.update(users).set({ password: hashedPassword }).where(eq(users.id, session.user.id)))

  const hasJellyfin = (await getProviderUserId(session.user.id, 'jellyfin')) !== null
  if (hasJellyfin) {
    const syncSettings = await getSyncUserSettings(session.user.id, 'jellyfin')
    try {
      await syncUserUpdate(session.user.id, { username: user.username, password: body.newPassword }, syncSettings)
    } catch (error) {
      log.error(`[Sync] Password sync to Jellyfin failed for user ${user.username}:`, error)
    }
  }

  await logActivity(event, {
    action: 'user_password_change',
    userId: session.user.id,
    username: user.username,
    details: JSON.stringify({ targetUserId: session.user.id })
  })

  return { success: true }
})
