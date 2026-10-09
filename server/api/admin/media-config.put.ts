import { putSetting } from '#server/utils/settings'
import { parseImportMode } from '#server/utils/library/media-settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ enabled?: boolean; importMode?: string }>(event)

  if (body.enabled !== undefined) {
    await putSetting(SETTINGS.MEDIA_MANAGE_ENABLED, body.enabled ? 'true' : 'false')
  }

  let importMode: string | undefined
  if (body.importMode !== undefined) {
    importMode = parseImportMode(body.importMode)
    await putSetting(SETTINGS.MEDIA_IMPORT_MODE, importMode)
  }

  await logActivity(event, {
    action: 'media_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({
      enabled: body.enabled,
      importMode
    })
  })

  return { success: true }
})
