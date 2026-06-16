import { settings } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = useDb()
  const row = db.select().from(settings).where(eq(settings.key, 'discord_locale')).get()

  return { locale: row?.value ?? 'pl' }
})
