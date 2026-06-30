import { DISCORD_LOCALE_OPTIONS } from '#server/utils/i18n-server'
import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ locale?: string }>(event)
  const locale = body.locale

  if (locale === undefined || locale === null || !DISCORD_LOCALE_OPTIONS.includes(locale as never)) {
    throw createError({ statusCode: 400, statusMessage: `Locale must be one of: ${DISCORD_LOCALE_OPTIONS.join(', ')}` })
  }

  putSetting(SETTINGS.DISCORD_LOCALE, locale)

  return { locale }
})
