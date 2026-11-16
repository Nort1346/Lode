import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import { parseStoredLibraryAccess } from '#server/utils/sync/provider-settings'

const PRESET_KEYS = [
  SETTINGS.PLEX_DEFAULT_LIBRARY_ACCESS,
  SETTINGS.PLEX_DEFAULT_LIVE_TV_ACCESS,
  SETTINGS.PLEX_DEFAULT_SYNC,
  SETTINGS.PLEX_SYNC_ENABLED
] as const

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const presets: Record<string, string> = {}
  for (const key of PRESET_KEYS) {
    presets[key] = (await getSetting(key)) ?? ''
  }

  return {
    syncEnabled: presets[SETTINGS.PLEX_SYNC_ENABLED] !== 'false',
    // Same lenient parser the sync provider uses, so the admin UI and the
    // provider can never disagree about what is stored (including a corrupt row).
    libraryAccess: parseStoredLibraryAccess(presets[SETTINGS.PLEX_DEFAULT_LIBRARY_ACCESS]),
    liveTvAccess: presets[SETTINGS.PLEX_DEFAULT_LIVE_TV_ACCESS] !== 'false',
    sync: presets[SETTINGS.PLEX_DEFAULT_SYNC] !== 'false'
  }
})
