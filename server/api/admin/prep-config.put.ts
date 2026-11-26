import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ enabled?: boolean; delaySeconds?: number }>(event)

  if (body.enabled !== undefined) {
    await putSetting(SETTINGS.PREP_COUNTDOWN_ENABLED, body.enabled ? 'true' : 'false')
  }

  if (body.delaySeconds !== undefined && Number.isFinite(body.delaySeconds)) {
    await putSetting(SETTINGS.PREP_DELAY_SECONDS, String(Math.max(0, Math.min(300, Math.round(body.delaySeconds)))))
  }

  await logActivity(event, {
    action: 'prep_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ enabled: body.enabled, delaySeconds: body.delaySeconds })
  })

  return { success: true }
})
