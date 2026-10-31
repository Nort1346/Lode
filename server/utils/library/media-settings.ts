import { SETTINGS } from '#server/types/settings'
import { getSetting } from '#server/utils/settings'
import {
  DEFAULT_EXTRA_FILE_EXTENSIONS,
  MAX_EXTRA_FILE_EXTENSIONS,
  MEDIA_IMPORT_MODES,
  type MediaConfig,
  type MediaImportMode
} from '#server/types/media-organize'

function isImportMode(value: string): value is MediaImportMode {
  return (MEDIA_IMPORT_MODES as readonly string[]).includes(value)
}

export function parseImportMode(raw: string | undefined): MediaImportMode {
  if (raw !== undefined && isImportMode(raw)) return raw
  return 'hardlink'
}

// Comma separated allow-list of sidecar extensions. Empty/invalid input falls
// back to the defaults instead of disabling the whole import.
export function parseExtraFileExtensions(raw: unknown): string[] {
  const source = typeof raw === 'string' ? raw.trim() : ''
  if (source === '') return [...DEFAULT_EXTRA_FILE_EXTENSIONS]

  const parsed = source
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^\./, ''))
    .filter((entry) => /^[a-z0-9]{1,8}$/.test(entry))

  const unique = [...new Set(parsed)]
  if (unique.length === 0) return [...DEFAULT_EXTRA_FILE_EXTENSIONS]
  return unique.slice(0, MAX_EXTRA_FILE_EXTENSIONS)
}

export async function isMediaManageEnabled(): Promise<boolean> {
  return (await getSetting(SETTINGS.MEDIA_MANAGE_ENABLED)) === 'true'
}

export async function getMediaImportMode(): Promise<MediaImportMode> {
  return parseImportMode(await getSetting(SETTINGS.MEDIA_IMPORT_MODE))
}

export async function isImportExtraFilesEnabled(): Promise<boolean> {
  return (await getSetting(SETTINGS.MEDIA_IMPORT_EXTRA_FILES)) === 'true'
}

export async function getExtraFileExtensions(): Promise<string[]> {
  return parseExtraFileExtensions(await getSetting(SETTINGS.MEDIA_EXTRA_FILE_EXTENSIONS))
}

export async function getMediaConfig(): Promise<MediaConfig> {
  const [enabled, importMode, importExtraFiles, extraFileExtensions] = await Promise.all([
    isMediaManageEnabled(),
    getMediaImportMode(),
    isImportExtraFilesEnabled(),
    getExtraFileExtensions()
  ])
  return { enabled, importMode, importExtraFiles, extraFileExtensions }
}
