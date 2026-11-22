import { z } from 'zod'
import type { SyncUserSettings } from './types'
import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import { createLogger } from '#server/utils/logger'

const log = createLogger('Sync')

// Library access is persisted as either the literal `all` or a JSON array of
// provider library/section ids. Stored values are parsed leniently (a corrupt
// row must never break sync), while admin request bodies are validated strictly
// with `libraryAccessInputSchema` before they reach a provider.
export type LibraryAccess = string[] | 'all'

export const libraryAccessInputSchema = z.union([z.literal('all'), z.array(z.string().min(1))])

// Plex fields of the admin user create/edit payload. Shared by both routes so
// the same malformed value cannot be accepted by one and rejected by the other.
export const plexUserSettingsInputSchema = z.object({
  plexLibraryAccess: libraryAccessInputSchema.optional(),
  plexEnableLiveTvAccess: z.boolean().optional(),
  plexEnableSync: z.boolean().optional()
})

// Lenient parse of a persisted setting or DB row. Falls back to "all" on a
// malformed value, which is the same default the presets endpoint reports so
// the admin UI and the sync provider never disagree about what is stored.
export function parseStoredLibraryAccess(raw: string | null | undefined): LibraryAccess {
  if (raw === null || raw === undefined || raw === '' || raw === 'all') return 'all'

  try {
    const parsed: unknown = JSON.parse(raw)
    // DB rows store the value JSON-encoded, so "all" arrives as `"all"`.
    if (parsed === 'all') return 'all'
    if (Array.isArray(parsed) && parsed.every((value): value is string => typeof value === 'string' && value !== '')) {
      return parsed
    }
  } catch {
    // Reported below; the caller gets the documented default.
  }

  log.warn(`ignoring malformed library access setting (using "all"): ${raw.slice(0, 120)}`)
  return 'all'
}

export interface PlexSettingsOverrides {
  libraryAccess?: LibraryAccess
  enableLiveTvAccess?: boolean
  enableSync?: boolean
}

// Plex defaults, mirroring getDefaultSyncSettings. The Plex model only exposes
// library access, Live TV (allowTuners) and downloads (allowSync) per user - the
// remaining fields on the shared SyncUserSettings shape are harmless filler the
// provider ignores. Shared by the sync orchestrator and the provider itself so
// the two definitions cannot drift apart (and no orchestrator import is needed,
// which would create a cycle).
export async function buildPlexSyncSettings(overrides?: PlexSettingsOverrides): Promise<SyncUserSettings> {
  const defaultLibraryAccess = parseStoredLibraryAccess(await getSetting(SETTINGS.PLEX_DEFAULT_LIBRARY_ACCESS))
  const defaultLiveTvAccess = (await getSetting(SETTINGS.PLEX_DEFAULT_LIVE_TV_ACCESS)) !== 'false'
  const defaultSync = (await getSetting(SETTINGS.PLEX_DEFAULT_SYNC)) !== 'false'

  return {
    libraryAccess: overrides?.libraryAccess ?? defaultLibraryAccess,
    enableVideoTranscoding: true,
    enableAudioTranscoding: true,
    enableRemuxing: true,
    enableLiveTvAccess: overrides?.enableLiveTvAccess ?? defaultLiveTvAccess,
    enableLiveTvManagement: false,
    enableSync: overrides?.enableSync ?? defaultSync,
    maxActiveSessions: 0
  }
}
