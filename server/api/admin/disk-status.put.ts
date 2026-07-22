import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ minFreeSpaceGb?: number; checkEnabled?: boolean }>(event)

  if (body.checkEnabled !== undefined) {
    await putSetting(SETTINGS.DISK_CHECK_ENABLED, body.checkEnabled ? 'true' : 'false')
  }

  if (body.minFreeSpaceGb !== undefined) {
    await putSetting(SETTINGS.DISK_MIN_FREE_GB, String(body.minFreeSpaceGb))
  }

  logActivity(event, {
    action: 'disk_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify(body)
  })

  return { ok: true }
})
