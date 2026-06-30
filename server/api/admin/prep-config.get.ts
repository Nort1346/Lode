import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return {
    enabled: getSetting(SETTINGS.PREP_COUNTDOWN_ENABLED) === 'true',
    speedMb: Number(getSetting(SETTINGS.PREP_SPEED_MB) ?? '15')
  }
})
