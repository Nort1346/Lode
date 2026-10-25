import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

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

  const libraryAccessValue = presets[SETTINGS.PLEX_DEFAULT_LIBRARY_ACCESS] ?? ''
  let parsedLibraryAccess: string[] | 'all' = 'all'
  if (libraryAccessValue !== '' && libraryAccessValue !== 'all') {
    try {
      parsedLibraryAccess = JSON.parse(libraryAccessValue) as string[]
    } catch {
      parsedLibraryAccess = 'all'
    }
  }

  return {
    syncEnabled: presets[SETTINGS.PLEX_SYNC_ENABLED] !== 'false',
    libraryAccess: parsedLibraryAccess,
    liveTvAccess: presets[SETTINGS.PLEX_DEFAULT_LIVE_TV_ACCESS] !== 'false',
    sync: presets[SETTINGS.PLEX_DEFAULT_SYNC] !== 'false'
  }
})
