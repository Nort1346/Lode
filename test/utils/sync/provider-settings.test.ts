import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: {
    PLEX_DEFAULT_LIBRARY_ACCESS: 'plex_default_library_access',
    PLEX_DEFAULT_LIVE_TV_ACCESS: 'plex_default_live_tv_access',
    PLEX_DEFAULT_SYNC: 'plex_default_sync'
  }
}))

import { buildPlexSyncSettings, parseStoredLibraryAccess } from '#server/utils/sync/provider-settings'

describe('parseStoredLibraryAccess', () => {
  it('treats an absent or empty value as "all"', () => {
    expect(parseStoredLibraryAccess(undefined)).toBe('all')
    expect(parseStoredLibraryAccess(null)).toBe('all')
    expect(parseStoredLibraryAccess('')).toBe('all')
  })

  it('accepts the literal "all"', () => {
    expect(parseStoredLibraryAccess('all')).toBe('all')
  })

  it('accepts the JSON-encoded "all" used by DB rows', () => {
    expect(parseStoredLibraryAccess('"all"')).toBe('all')
  })

  it('parses a JSON array of ids', () => {
    expect(parseStoredLibraryAccess('["1","2"]')).toEqual(['1', '2'])
  })

  it('falls back to "all" for malformed JSON', () => {
    expect(parseStoredLibraryAccess('{"broken"')).toBe('all')
  })

  it('falls back to "all" when the array holds non-string entries', () => {
    expect(parseStoredLibraryAccess('[1,2]')).toBe('all')
    expect(parseStoredLibraryAccess('["", "2"]')).toBe('all')
  })

  it('falls back to "all" for a JSON scalar', () => {
    expect(parseStoredLibraryAccess('"movies"')).toBe('all')
    expect(parseStoredLibraryAccess('42')).toBe('all')
  })
})

describe('buildPlexSyncSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSetting.mockResolvedValue(undefined)
  })

  it('builds from the stored defaults', async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === 'plex_default_library_access') return '["1","2"]'
      if (key === 'plex_default_sync') return 'false'
      return undefined
    })

    const settings = await buildPlexSyncSettings()

    expect(settings).toEqual({
      libraryAccess: ['1', '2'],
      enableVideoTranscoding: true,
      enableAudioTranscoding: true,
      enableRemuxing: true,
      enableLiveTvAccess: true,
      enableLiveTvManagement: false,
      enableSync: false,
      maxActiveSessions: 0
    })
  })

  it('prefers the overrides', async () => {
    const settings = await buildPlexSyncSettings({
      libraryAccess: ['9'],
      enableLiveTvAccess: false,
      enableSync: true
    })

    expect(settings.libraryAccess).toEqual(['9'])
    expect(settings.enableLiveTvAccess).toBe(false)
    expect(settings.enableSync).toBe(true)
  })

  it('uses "all" when the stored library list is corrupt', async () => {
    mockGetSetting.mockImplementation(async (key: string) =>
      key === 'plex_default_library_access' ? 'not json at all' : undefined
    )

    await expect(buildPlexSyncSettings()).resolves.toEqual(expect.objectContaining({ libraryAccess: 'all' }))
  })
})
