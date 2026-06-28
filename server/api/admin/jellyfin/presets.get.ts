import { getSetting } from '#server/utils/settings'

const PRESET_KEYS = [
  'jellyfin_default_library_access',
  'jellyfin_default_video_transcoding',
  'jellyfin_default_audio_transcoding',
  'jellyfin_default_remuxing',
  'jellyfin_default_max_active_sessions',
  'jellyfin_sync_enabled'
] as const

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const presets: Record<string, string> = {}
  for (const key of PRESET_KEYS) {
    presets[key] = getSetting(key) ?? ''
  }

  const libraryAccessValue = presets.jellyfin_default_library_access ?? ''
  const parsedLibraryAccess: string[] | 'all' =
    libraryAccessValue === '' || libraryAccessValue === 'all' ? 'all' : (JSON.parse(libraryAccessValue) as string[])

  return {
    syncEnabled: presets.jellyfin_sync_enabled !== 'false',
    libraryAccess: parsedLibraryAccess,
    videoTranscoding: presets.jellyfin_default_video_transcoding !== 'false',
    audioTranscoding: presets.jellyfin_default_audio_transcoding !== 'false',
    remuxing: presets.jellyfin_default_remuxing !== 'false',
    maxActiveSessions: Number(presets.jellyfin_default_max_active_sessions) || 0
  }
})
