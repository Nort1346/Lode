import { SETTINGS } from '#server/types/settings'
import { getSetting } from '#server/utils/settings'
import { MEDIA_IMPORT_MODES, type MediaConfig, type MediaImportMode } from '#server/types/media-organize'

function isImportMode(value: string): value is MediaImportMode {
  return (MEDIA_IMPORT_MODES as readonly string[]).includes(value)
}

export function parseImportMode(raw: string | undefined): MediaImportMode {
  if (raw !== undefined && isImportMode(raw)) return raw
  return 'hardlink'
}

export async function isMediaManageEnabled(): Promise<boolean> {
  return (await getSetting(SETTINGS.MEDIA_MANAGE_ENABLED)) === 'true'
}

export async function getMediaImportMode(): Promise<MediaImportMode> {
  return parseImportMode(await getSetting(SETTINGS.MEDIA_IMPORT_MODE))
}

export async function getMediaConfig(): Promise<MediaConfig> {
  const [enabled, importMode] = await Promise.all([isMediaManageEnabled(), getMediaImportMode()])
  return { enabled, importMode }
}
