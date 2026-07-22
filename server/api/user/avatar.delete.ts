import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncAvatarDelete } from '#server/utils/sync'
import { unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const db = useDb()
  db.update(users).set({ avatarUrl: null }).where(eq(users.id, session.user.id)).run()

  const avatarPath = resolve(process.cwd(), '.output', 'public', 'avatars', `${session.user.id}.jpg`)
  try {
    unlinkSync(avatarPath)
  } catch {
    // file may not exist
  }

  await syncAvatarDelete(session.user.id)

  return { success: true }
})
