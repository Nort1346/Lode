import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: {
    PLEX_SYNC_ENABLED: 'plex_sync_enabled',
    PLEX_DEFAULT_LIBRARY_ACCESS: 'plex_default_library_access',
    PLEX_DEFAULT_LIVE_TV_ACCESS: 'plex_default_live_tv_access',
    PLEX_DEFAULT_SYNC: 'plex_default_sync'
  }
}))

import handler from '#server/api/admin/plex/presets.get'

describe('admin/plex/presets.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetSetting.mockReset()
  })

  const mockEvent = {} as never

  it('returns presets from settings', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        plex_sync_enabled: 'false',
        plex_default_library_access: '["1","2"]',
        plex_default_live_tv_access: 'false',
        plex_default_sync: 'false'
      }
      return values[key] ?? ''
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({
      syncEnabled: false,
      libraryAccess: ['1', '2'],
      liveTvAccess: false,
      sync: false
    })
  })

  it('returns defaults when no settings', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockReturnValue('')

    const result = await handler(mockEvent)
    expect(result).toEqual({
      syncEnabled: true,
      libraryAccess: 'all',
      liveTvAccess: true,
      sync: true
    })
  })

  it('parses library access from JSON', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'plex_default_library_access') return '["3","4"]'
      return ''
    })

    const result = await handler(mockEvent)
    expect(result.libraryAccess).toEqual(['3', '4'])
  })

  it('falls back to all on invalid library access JSON', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'plex_default_library_access') return '{broken'
      return ''
    })

    const result = await handler(mockEvent)
    expect(result.libraryAccess).toBe('all')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
