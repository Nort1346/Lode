import { settings } from '#server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = useDb()
  const rows = db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .all()
    .filter((r) => r.key === 'prep_countdown_enabled' || r.key === 'prep_speed_mb')

  const map = new Map(rows.map((r) => [r.key, r.value]))

  return {
    enabled: map.get('prep_countdown_enabled') === 'true',
    speedMb: Number(map.get('prep_speed_mb') ?? '15')
  }
})
