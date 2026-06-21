import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ minFreeSpaceGb?: number; checkEnabled?: boolean }>(event)

  const db = useDb()

  if (body.checkEnabled !== undefined) {
    const value = body.checkEnabled ? 'true' : 'false'
    const existing = db.select().from(settings).where(eq(settings.key, 'disk_check_enabled')).get()
    if (existing) {
      db.update(settings).set({ value }).where(eq(settings.key, 'disk_check_enabled')).run()
    } else {
      db.insert(settings).values({ key: 'disk_check_enabled', value }).run()
    }
  }

  if (body.minFreeSpaceGb !== undefined) {
    const value = String(body.minFreeSpaceGb)
    const existing = db.select().from(settings).where(eq(settings.key, 'disk_min_free_gb')).get()
    if (existing) {
      db.update(settings).set({ value }).where(eq(settings.key, 'disk_min_free_gb')).run()
    } else {
      db.insert(settings).values({ key: 'disk_min_free_gb', value }).run()
    }
  }

  logActivity(event, {
    action: 'disk_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify(body)
  })

  return { ok: true }
})
