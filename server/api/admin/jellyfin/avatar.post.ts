import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncAvatar } from '#server/utils/sync'
import { validateAndProcessAvatar } from '#server/utils/avatar'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useDbAsync, dbRun } from '#server/utils/db'

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

  const avatarsDir = resolve(process.cwd(), '.output', 'public', 'avatars')
  if (!existsSync(avatarsDir)) {
    mkdirSync(avatarsDir, { recursive: true })
  }

  const avatarPath = resolve(avatarsDir, `${userId}.jpg`)
  writeFileSync(avatarPath, processedImage)

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
