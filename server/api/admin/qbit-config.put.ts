import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ autoRemoveCompleted?: boolean; seedingEnabled?: boolean }>(event)

  if (body.autoRemoveCompleted !== undefined) {
    await putSetting(SETTINGS.QBIT_AUTO_REMOVE_COMPLETED, body.autoRemoveCompleted ? 'true' : 'false')
  }

  if (body.seedingEnabled !== undefined) {
    await putSetting(SETTINGS.QBIT_SEEDING_ENABLED, body.seedingEnabled ? 'true' : 'false')
  }

  await logActivity(event, {
    action: 'qbit_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({
      autoRemoveCompleted: body.autoRemoveCompleted,
      seedingEnabled: body.seedingEnabled
    })
  })

  return { success: true }
})
