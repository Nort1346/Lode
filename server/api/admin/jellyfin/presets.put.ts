import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import type { JellyfinPresetsBody } from '#server/utils/sync/types'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<JellyfinPresetsBody>(event)

  if (body.syncEnabled !== undefined) {
    await putSetting(SETTINGS.JELLYFIN_SYNC_ENABLED, String(body.syncEnabled))
  }
  if (body.libraryAccess !== undefined) {
    await putSetting(
      SETTINGS.JELLYFIN_DEFAULT_LIBRARY_ACCESS,
      body.libraryAccess === 'all' ? 'all' : JSON.stringify(body.libraryAccess)
    )
  }
  if (body.videoTranscoding !== undefined) {
    await putSetting(SETTINGS.JELLYFIN_DEFAULT_VIDEO_TRANSCODING, String(body.videoTranscoding))
  }
  if (body.audioTranscoding !== undefined) {
    await putSetting(SETTINGS.JELLYFIN_DEFAULT_AUDIO_TRANSCODING, String(body.audioTranscoding))
  }
  if (body.remuxing !== undefined) {
    await putSetting(SETTINGS.JELLYFIN_DEFAULT_REMUXING, String(body.remuxing))
  }
  if (body.liveTvAccess !== undefined) {
    await putSetting(SETTINGS.JELLYFIN_DEFAULT_LIVE_TV_ACCESS, String(body.liveTvAccess))
  }
  if (body.liveTvManagement !== undefined) {
    await putSetting(SETTINGS.JELLYFIN_DEFAULT_LIVE_TV_MANAGEMENT, String(body.liveTvManagement))
  }
  if (body.maxActiveSessions !== undefined) {
    await putSetting(SETTINGS.JELLYFIN_DEFAULT_MAX_ACTIVE_SESSIONS, String(body.maxActiveSessions))
  }

  return { success: true }
})
