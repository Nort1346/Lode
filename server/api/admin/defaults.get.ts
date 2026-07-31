import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return {
    dailyDownloadLimit: Number((await getSetting(SETTINGS.USER_DEFAULT_DAILY_DOWNLOAD_LIMIT)) ?? '5') || 5,
    activeTorrentLimit: Number((await getSetting(SETTINGS.USER_DEFAULT_ACTIVE_TORRENT_LIMIT)) ?? '3') || 3,
    maxTorrentSizeGb: Number((await getSetting(SETTINGS.USER_DEFAULT_MAX_TORRENT_SIZE_GB)) ?? '20') || 20,
    privateTrackerLimit: Number((await getSetting(SETTINGS.USER_DEFAULT_PRIVATE_TRACKER_LIMIT)) ?? '5') || 5,
    maxSessions: Number((await getSetting(SETTINGS.USER_DEFAULT_MAX_SESSIONS)) ?? '0') || 0,
    canSubmit: (await getSetting(SETTINGS.USER_DEFAULT_CAN_SUBMIT)) === 'true'
  }
})
