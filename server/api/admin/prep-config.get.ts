import { getSetting } from '#server/utils/settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return {
    enabled: getSetting('prep_countdown_enabled') === 'true',
    speedMb: Number(getSetting('prep_speed_mb') ?? '15')
  }
})
