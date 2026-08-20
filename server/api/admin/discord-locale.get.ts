import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const value = await getSetting(SETTINGS.DISCORD_LOCALE)

  return { locale: value ?? 'en' }
})
