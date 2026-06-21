import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ enabled: boolean }>(event)

  const db = useDb()
  const value = body.enabled ? 'true' : 'false'

  const existing = db.select().from(settings).where(eq(settings.key, 'discord_mentions_enabled')).get()
  if (existing) {
    db.update(settings).set({ value }).where(eq(settings.key, 'discord_mentions_enabled')).run()
  } else {
    db.insert(settings).values({ key: 'discord_mentions_enabled', value }).run()
  }

  logActivity(event, {
    action: 'discord_mentions_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ enabled: body.enabled })
  })

  return { enabled: body.enabled }
})
