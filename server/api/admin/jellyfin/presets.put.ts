import { putSetting } from '#server/utils/settings'
import type { JellyfinPresetsBody } from '#server/utils/sync/types'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<JellyfinPresetsBody>(event)

  if (body.syncEnabled !== undefined) {
    putSetting('jellyfin_sync_enabled', String(body.syncEnabled))
  }
  if (body.libraryAccess !== undefined) {
    putSetting(
      'jellyfin_default_library_access',
      body.libraryAccess === 'all' ? 'all' : JSON.stringify(body.libraryAccess)
    )
  }
  if (body.videoTranscoding !== undefined) {
    putSetting('jellyfin_default_video_transcoding', String(body.videoTranscoding))
  }
  if (body.audioTranscoding !== undefined) {
    putSetting('jellyfin_default_audio_transcoding', String(body.audioTranscoding))
  }
  if (body.remuxing !== undefined) {
    putSetting('jellyfin_default_remuxing', String(body.remuxing))
  }
  if (body.liveTvAccess !== undefined) {
    putSetting('jellyfin_default_live_tv_access', String(body.liveTvAccess))
  }
  if (body.liveTvManagement !== undefined) {
    putSetting('jellyfin_default_live_tv_management', String(body.liveTvManagement))
  }
  if (body.maxActiveSessions !== undefined) {
    putSetting('jellyfin_default_max_active_sessions', String(body.maxActiveSessions))
  }

  return { success: true }
})
