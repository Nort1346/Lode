import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ autoRemoveCompleted?: boolean }>(event)

  if (body.autoRemoveCompleted !== undefined) {
    await putSetting(SETTINGS.QBIT_AUTO_REMOVE_COMPLETED, body.autoRemoveCompleted ? 'true' : 'false')
  }

  await logActivity(event, {
    action: 'qbit_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ autoRemoveCompleted: body.autoRemoveCompleted })
  })

  return { success: true }
})
