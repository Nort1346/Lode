import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return {
    enabled: (await getSetting(SETTINGS.PREP_COUNTDOWN_ENABLED)) === 'true',
    delaySeconds: Number((await getSetting(SETTINGS.PREP_DELAY_SECONDS)) ?? '30')
  }
})
