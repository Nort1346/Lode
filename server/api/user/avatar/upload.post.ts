import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { validateAndProcessAvatar } from '#server/utils/avatar'
import { syncAvatar } from '#server/utils/sync'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { useDbAsync, dbRun } from '#server/utils/db'
import { AVATARS_DIR } from '#server/utils/paths'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data provided' })
  }

  const imageField = formData.find((f) => f.name === 'avatar' && f.filename !== undefined && f.filename !== '')

  if (imageField === undefined || imageField.data === undefined || imageField.type === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Avatar image is required' })
  }

  const processedImage = await validateAndProcessAvatar(imageField.data, imageField.type)

  const avatarsDir = AVATARS_DIR
  if (!existsSync(avatarsDir)) {
    await mkdir(avatarsDir, { recursive: true })
  }

  const avatarPath = resolve(avatarsDir, `${session.user.id}.jpg`)
  await writeFile(avatarPath, processedImage)

  const db = await useDbAsync()
  await dbRun(
    db
      .update(users)
      .set({ avatarUrl: `/avatars/${session.user.id}.jpg` })
      .where(eq(users.id, session.user.id))
  )

  await syncAvatar(session.user.id, processedImage)

  return { avatarUrl: `/avatars/${session.user.id}.jpg` }
})
