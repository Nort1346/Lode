import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncAvatarDelete } from '#server/utils/sync'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import { unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ userId: string }>(event)
  if (!body?.userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }

  const db = await useDbAsync()
  const user = await dbGet(db.select().from(users).where(eq(users.id, body.userId)))

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const avatarPath = resolve(process.cwd(), '.output', 'public', 'avatars', `${body.userId}.jpg`)
  try {
    unlinkSync(avatarPath)
  } catch {
    // file may not exist — ignore
  }

  await dbRun(db.update(users).set({ avatarUrl: null }).where(eq(users.id, body.userId)))

  await syncAvatarDelete(body.userId)

  return { success: true }
})
