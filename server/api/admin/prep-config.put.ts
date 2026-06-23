import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ enabled?: boolean; speedMb?: number }>(event)
  const db = useDb()

  if (body.enabled !== undefined) {
    const key = 'prep_countdown_enabled'
    const value = body.enabled ? 'true' : 'false'
    const existing = db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get()
    if (existing !== undefined) {
      db.update(settings).set({ value }).where(eq(settings.key, key)).run()
    } else {
      db.insert(settings).values({ key, value }).run()
    }
  }

  if (body.speedMb !== undefined) {
    const key = 'prep_speed_mb'
    const value = String(Math.max(1, Math.min(100, Math.round(body.speedMb))))
    const existing = db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get()
    if (existing !== undefined) {
      db.update(settings).set({ value }).where(eq(settings.key, key)).run()
    } else {
      db.insert(settings).values({ key, value }).run()
    }
  }

  logActivity(event, {
    action: 'prep_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ enabled: body.enabled, speedMb: body.speedMb })
  })

  return { success: true }
})
