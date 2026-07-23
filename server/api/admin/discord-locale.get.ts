import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = await useDbAsync()
  const row = await dbGet(db.select().from(settings).where(eq(settings.key, 'discord_locale')))

  return { locale: row?.value ?? 'en' }
})
