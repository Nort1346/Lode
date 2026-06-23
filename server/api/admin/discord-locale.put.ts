import { settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { DISCORD_LOCALE_OPTIONS } from '#server/utils/i18n-server'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ locale?: string }>(event)
  const locale = body.locale

  if (locale === undefined || locale === null || !DISCORD_LOCALE_OPTIONS.includes(locale as never)) {
    throw createError({ statusCode: 400, statusMessage: `Locale must be one of: ${DISCORD_LOCALE_OPTIONS.join(', ')}` })
  }

  const db = useDb()
  const existing = db.select().from(settings).where(eq(settings.key, 'discord_locale')).get()

  if (existing !== undefined) {
    db.update(settings).set({ value: locale }).where(eq(settings.key, 'discord_locale')).run()
  } else {
    db.insert(settings).values({ key: 'discord_locale', value: locale }).run()
  }

  return { locale }
})
