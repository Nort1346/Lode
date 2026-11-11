import { putSetting } from '#server/utils/settings'
import { parseExtraFileExtensions, parseImportMode } from '#server/utils/library/media-settings'
import { SETTINGS } from '#server/types/settings'
import type { MediaConfigUpdate } from '#server/types/media-organize'

function hasPath(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

// Media organization imports finished downloads out of the staging dir, like
// Radarr does. Without staging, qBittorrent would write straight into the
// library and the only way to rename files would be inside the torrent, which
// leaves leftovers in the library and makes "delete download" remove the
// organized file. So enabling it requires at least one staging path.
function assertStagingConfigured(): void {
  const runtime = useRuntimeConfig()
  if (hasPath(runtime.downloadPathMovies) || hasPath(runtime.downloadPathSeries)) return

  throw createError({
    statusCode: 400,
    statusMessage: 'Set NUXT_DOWNLOAD_PATH_MOVIES and/or NUXT_DOWNLOAD_PATH_SERIES before enabling media organization'
  })
}

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<MediaConfigUpdate>(event)

  // readBody typing is a compile-time cast only, so a JSON string would slip
  // through: `"false"` is truthy and would enable the feature while skipping
  // the staging check below.
  const enabled = body.enabled
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'enabled must be a boolean' })
  }

  if (enabled === true) {
    assertStagingConfigured()
  }

  if (enabled !== undefined) {
    await putSetting(SETTINGS.MEDIA_MANAGE_ENABLED, enabled ? 'true' : 'false')
  }

  let importMode: string | undefined
  if (body.importMode !== undefined) {
    importMode = parseImportMode(body.importMode)
    await putSetting(SETTINGS.MEDIA_IMPORT_MODE, importMode)
  }

  if (body.importExtraFiles !== undefined) {
    await putSetting(SETTINGS.MEDIA_IMPORT_EXTRA_FILES, body.importExtraFiles ? 'true' : 'false')
  }

  let extraFileExtensions: string | undefined
  if (body.extraFileExtensions !== undefined) {
    extraFileExtensions = parseExtraFileExtensions(body.extraFileExtensions).join(',')
    await putSetting(SETTINGS.MEDIA_EXTRA_FILE_EXTENSIONS, extraFileExtensions)
  }

  await logActivity(event, {
    action: 'media_config_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({
      enabled,
      importMode,
      importExtraFiles: body.importExtraFiles,
      extraFileExtensions
    })
  })

  return { success: true }
})
