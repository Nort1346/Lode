import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import { disableSeedingForTrackedTorrents } from '#server/utils/torrents/seeding'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ autoRemoveCompleted?: boolean; seedingEnabled?: boolean }>(event)

  if (body.autoRemoveCompleted !== undefined) {
    await putSetting(SETTINGS.QBIT_AUTO_REMOVE_COMPLETED, body.autoRemoveCompleted ? 'true' : 'false')
  }

  if (body.seedingEnabled !== undefined) {
    await putSetting(SETTINGS.QBIT_SEEDING_ENABLED, body.seedingEnabled ? 'true' : 'false')
    // The toggle must also stop torrents that were added before it was turned
    // off. The helper is best-effort and never fails the settings update.
    if (!body.seedingEnabled) await disableSeedingForTrackedTorrents()
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
