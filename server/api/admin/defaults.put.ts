import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import type { DefaultsBody } from '#server/types/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<DefaultsBody>(event)

  if (body.dailyDownloadLimit !== undefined) {
    await putSetting(SETTINGS.USER_DEFAULT_DAILY_DOWNLOAD_LIMIT, String(Math.max(0, body.dailyDownloadLimit)))
  }
  if (body.activeTorrentLimit !== undefined) {
    await putSetting(SETTINGS.USER_DEFAULT_ACTIVE_TORRENT_LIMIT, String(Math.max(0, body.activeTorrentLimit)))
  }
  if (body.maxTorrentSizeGb !== undefined) {
    await putSetting(SETTINGS.USER_DEFAULT_MAX_TORRENT_SIZE_GB, String(Math.max(0, body.maxTorrentSizeGb)))
  }
  if (body.privateTrackerLimit !== undefined) {
    await putSetting(SETTINGS.USER_DEFAULT_PRIVATE_TRACKER_LIMIT, String(Math.max(0, body.privateTrackerLimit)))
  }
  if (body.maxSessions !== undefined) {
    await putSetting(SETTINGS.USER_DEFAULT_MAX_SESSIONS, String(Math.max(0, body.maxSessions)))
  }
  if (body.canSubmit !== undefined) {
    await putSetting(SETTINGS.USER_DEFAULT_CAN_SUBMIT, String(body.canSubmit))
  }

  return { success: true }
})
