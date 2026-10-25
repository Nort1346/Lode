import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import type { PlexPresetsBody } from '#server/utils/sync/types'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<PlexPresetsBody>(event)

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
