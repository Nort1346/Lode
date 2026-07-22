import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

const PRESET_KEYS = [
  SETTINGS.JELLYFIN_DEFAULT_LIBRARY_ACCESS,
  SETTINGS.JELLYFIN_DEFAULT_VIDEO_TRANSCODING,
  SETTINGS.JELLYFIN_DEFAULT_AUDIO_TRANSCODING,
  SETTINGS.JELLYFIN_DEFAULT_REMUXING,
  SETTINGS.JELLYFIN_DEFAULT_LIVE_TV_ACCESS,
  SETTINGS.JELLYFIN_DEFAULT_LIVE_TV_MANAGEMENT,
  SETTINGS.JELLYFIN_DEFAULT_MAX_ACTIVE_SESSIONS,
  SETTINGS.JELLYFIN_SYNC_ENABLED
] as const

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const presets: Record<string, string> = {}
  for (const key of PRESET_KEYS) {
    presets[key] = (await getSetting(key)) ?? ''
  }

  const libraryAccessValue = presets[SETTINGS.JELLYFIN_DEFAULT_LIBRARY_ACCESS] ?? ''
  const parsedLibraryAccess: string[] | 'all' =
    libraryAccessValue === '' || libraryAccessValue === 'all' ? 'all' : (JSON.parse(libraryAccessValue) as string[])

  return {
    syncEnabled: presets[SETTINGS.JELLYFIN_SYNC_ENABLED] !== 'false',
    libraryAccess: parsedLibraryAccess,
    videoTranscoding: presets[SETTINGS.JELLYFIN_DEFAULT_VIDEO_TRANSCODING] !== 'false',
    audioTranscoding: presets[SETTINGS.JELLYFIN_DEFAULT_AUDIO_TRANSCODING] !== 'false',
    remuxing: presets[SETTINGS.JELLYFIN_DEFAULT_REMUXING] !== 'false',
    liveTvAccess: presets[SETTINGS.JELLYFIN_DEFAULT_LIVE_TV_ACCESS] !== 'false',
    liveTvManagement: presets[SETTINGS.JELLYFIN_DEFAULT_LIVE_TV_MANAGEMENT] === 'true',
    maxActiveSessions: Number(presets[SETTINGS.JELLYFIN_DEFAULT_MAX_ACTIVE_SESSIONS]) || 0
  }
})
