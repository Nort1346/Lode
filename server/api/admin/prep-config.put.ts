import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ enabled?: boolean; speedMb?: number }>(event)

  if (body.enabled !== undefined) {
    await putSetting(SETTINGS.PREP_COUNTDOWN_ENABLED, body.enabled ? 'true' : 'false')
  }

  if (body.speedMb !== undefined) {
    await putSetting(SETTINGS.PREP_SPEED_MB, String(Math.max(1, Math.min(100, Math.round(body.speedMb)))))
  }

  logActivity(event, {
    action: 'prep_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ enabled: body.enabled, speedMb: body.speedMb })
  })

  return { success: true }
})
