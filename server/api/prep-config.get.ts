import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async () => {
  const enabled = (await getSetting(SETTINGS.PREP_COUNTDOWN_ENABLED)) === 'true'
  const delaySeconds = Number((await getSetting(SETTINGS.PREP_DELAY_SECONDS)) ?? '30')
  return {
    enabled,
    delaySeconds
  }
})
