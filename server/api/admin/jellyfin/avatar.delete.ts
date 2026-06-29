import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncAvatarDelete } from '#server/utils/sync'
import { unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ userId: string }>(event)
  if (!body?.userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }

  const db = useDb()
  const user = db.select().from(users).where(eq(users.id, body.userId)).get()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const avatarPath = resolve(process.cwd(), 'public', 'avatars', `${body.userId}.jpg`)
  try {
    unlinkSync(avatarPath)
  } catch {
    // file may not exist — ignore
  }

  db.update(users).set({ avatarUrl: null }).where(eq(users.id, body.userId)).run()

  await syncAvatarDelete(body.userId)

  return { success: true }
})
