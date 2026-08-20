import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncAvatar } from '#server/utils/sync'
import { validateAndProcessAvatar } from '#server/utils/avatar'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { useDbAsync, dbRun, dbGet } from '#server/utils/db'
import { AVATARS_DIR } from '#server/utils/paths'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data provided' })
  }

  const userIdField = formData.find((f) => f.name === 'userId')
  const imageField = formData.find((f) => f.name === 'avatar' && f.filename !== undefined && f.filename !== '')

  if (
    userIdField === undefined ||
    imageField === undefined ||
    imageField.data === undefined ||
    imageField.type === undefined
  ) {
    throw createError({ statusCode: 400, statusMessage: 'userId and avatar image are required' })
  }

  const userId = new TextDecoder().decode(userIdField.data)

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid userId format' })
  }

  const db = await useDbAsync()
  const user = await dbGet(db.select({ id: users.id }).from(users).where(eq(users.id, userId)))
  if (user === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const processedImage = await validateAndProcessAvatar(imageField.data, imageField.type)

  const avatarsDir = AVATARS_DIR
  if (!existsSync(avatarsDir)) {
    await mkdir(avatarsDir, { recursive: true })
  }

  const avatarPath = resolve(avatarsDir, `${userId}.jpg`)
  await writeFile(avatarPath, processedImage)

  await dbRun(
    db
      .update(users)
      .set({ avatarUrl: `/avatars/${userId}.jpg` })
      .where(eq(users.id, userId))
  )

  await syncAvatar(userId, processedImage)

  return { success: true, avatarUrl: `/avatars/${userId}.jpg` }
})
