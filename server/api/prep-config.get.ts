import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async () => {
  const enabled = (await getSetting(SETTINGS.PREP_COUNTDOWN_ENABLED)) === 'true'
  const speedMb = Number((await getSetting(SETTINGS.PREP_SPEED_MB)) ?? '15')
  return {
    enabled,
    speedMb
  }
})
