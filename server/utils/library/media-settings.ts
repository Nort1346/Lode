import { SETTINGS } from '#server/types/settings'
import { getSetting } from '#server/utils/settings'
import type { MediaConfig, MediaImportMode } from '#server/types/media-organize'

const IMPORT_MODES: readonly string[] = ['hardlink', 'copy', 'move']

export function parseImportMode(raw: string | undefined): MediaImportMode {
  if (raw !== undefined && IMPORT_MODES.includes(raw)) return raw as MediaImportMode
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
