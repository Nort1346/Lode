import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncAvatarDelete } from '#server/utils/sync'
import { unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { useDbAsync, dbRun } from '#server/utils/db'
import { AVATARS_DIR } from '#server/utils/paths'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const db = await useDbAsync()
  await dbRun(db.update(users).set({ avatarUrl: null }).where(eq(users.id, session.user.id)))

  const avatarPath = resolve(AVATARS_DIR, `${session.user.id}.jpg`)
  try {
    unlinkSync(avatarPath)
  } catch {
    // file may not exist
  }

  await syncAvatarDelete(session.user.id)

  return { success: true }
})
