import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncAvatar } from '#server/utils/sync'
import { validateAndProcessAvatar } from '#server/utils/avatar'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { useDbAsync, dbRun } from '#server/utils/db'
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

  const processedImage = await validateAndProcessAvatar(imageField.data, imageField.type)

  const avatarsDir = AVATARS_DIR
  if (!existsSync(avatarsDir)) {
    await mkdir(avatarsDir, { recursive: true })
  }

  const avatarPath = resolve(avatarsDir, `${userId}.jpg`)
  await writeFile(avatarPath, processedImage)

  const db = await useDbAsync()
  await dbRun(
    db
      .update(users)
      .set({ avatarUrl: `/avatars/${userId}.jpg` })
      .where(eq(users.id, userId))
  )

  await syncAvatar(userId, processedImage)

  return { success: true, avatarUrl: `/avatars/${userId}.jpg` }
})
