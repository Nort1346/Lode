import { hash } from '@node-rs/bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { syncUserCreate, syncUserUpdate, getSyncUserSettings, getProviderUserId } from '#server/utils/sync'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createLogger } from '#server/utils/logger'
import { AVATARS_DIR } from '#server/utils/paths'

const log = createLogger('SyncAdmin')

function generateTempPassword(length = 16): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i++) {
    const byte = bytes[i]
    if (byte !== undefined) {
      password += charset[byte % charset.length]
    }
  }
  return password
}

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

  const syncSettings = await getSyncUserSettings(id, 'jellyfin')
  const existingMapping = await getProviderUserId(id, 'jellyfin')

  let action: 'synced' | 'created'
  let tempPassword: string | undefined

  if (existingMapping !== null) {
    action = 'synced'
    try {
      await syncUserUpdate(id, { username: user.username, password: '' }, syncSettings)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`Force sync failed for user ${user.username}:`, message)
      throw createError({ statusCode: 500, statusMessage: `Sync failed: ${message}` })
    }
  } else {
    action = 'created'
    tempPassword = generateTempPassword()
    const hashedPassword = await hash(tempPassword, 12)
    await dbRun(db.update(users).set({ password: hashedPassword }).where(eq(users.id, id)))

    try {
      await syncUserCreate(id, { username: user.username, password: tempPassword }, syncSettings)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`Force sync failed for user ${user.username}:`, message)
      throw createError({ statusCode: 500, statusMessage: `Sync failed: ${message}` })
    }
  }

  const avatarPath = resolve(AVATARS_DIR, `${id}.jpg`)
  if (user.avatarUrl !== null && existsSync(avatarPath)) {
    try {
      const { syncAvatar } = await import('#server/utils/sync')
      const buffer = await readFile(avatarPath)
      await syncAvatar(id, buffer)
    } catch (error) {
      log.error(`Avatar sync failed for user ${user.username}:`, error)
    }
  }

  await logActivity(event, {
    action: 'user_force_sync',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ targetUser: user.username, targetUserId: id, action })
  })

  return { success: true, action, tempPassword }
})
