import { putSetting } from '#server/utils/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ minFreeSpaceGb?: number; checkEnabled?: boolean }>(event)

  if (body.checkEnabled !== undefined) {
    putSetting('disk_check_enabled', body.checkEnabled ? 'true' : 'false')
  }

  if (body.minFreeSpaceGb !== undefined) {
    putSetting('disk_min_free_gb', String(body.minFreeSpaceGb))
  }

  logActivity(event, {
    action: 'disk_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify(body)
  })

  return { ok: true }
})
