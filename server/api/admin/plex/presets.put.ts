import { z } from 'zod'
import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import { libraryAccessInputSchema } from '#server/utils/sync/provider-settings'

// Runtime validation: the library list is persisted as JSON and later mapped to
// section ids, so a malformed array (or a bare string) would break share
// creation for every user created from these defaults.
const presetsSchema = z.object({
  syncEnabled: z.boolean().optional(),
  libraryAccess: libraryAccessInputSchema.optional(),
  liveTvAccess: z.boolean().optional(),
  sync: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const parsed = presetsSchema.safeParse(await readBody<unknown>(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Plex presets payload' })
  }

  const body = parsed.data

  if (body.syncEnabled !== undefined) {
    await putSetting(SETTINGS.PLEX_SYNC_ENABLED, String(body.syncEnabled))
  }
  if (body.libraryAccess !== undefined) {
    await putSetting(
      SETTINGS.PLEX_DEFAULT_LIBRARY_ACCESS,
      body.libraryAccess === 'all' ? 'all' : JSON.stringify(body.libraryAccess)
    )
  }
  if (body.liveTvAccess !== undefined) {
    await putSetting(SETTINGS.PLEX_DEFAULT_LIVE_TV_ACCESS, String(body.liveTvAccess))
  }
  if (body.sync !== undefined) {
    await putSetting(SETTINGS.PLEX_DEFAULT_SYNC, String(body.sync))
  }

  return { success: true }
})
