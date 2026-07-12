import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: {
    JELLYFIN_DEFAULT_LIBRARY_ACCESS: 'jellyfin_default_library_access',
    JELLYFIN_DEFAULT_VIDEO_TRANSCODING: 'jellyfin_default_video_transcoding',
    JELLYFIN_DEFAULT_AUDIO_TRANSCODING: 'jellyfin_default_audio_transcoding',
    JELLYFIN_DEFAULT_REMUXING: 'jellyfin_default_remuxing',
    JELLYFIN_DEFAULT_LIVE_TV_ACCESS: 'jellyfin_default_live_tv_access',
    JELLYFIN_DEFAULT_LIVE_TV_MANAGEMENT: 'jellyfin_default_live_tv_management',
    JELLYFIN_DEFAULT_MAX_ACTIVE_SESSIONS: 'jellyfin_default_max_active_sessions',
    JELLYFIN_SYNC_ENABLED: 'jellyfin_sync_enabled'
  }
}))

import handler from '#server/api/admin/jellyfin/presets.get'

describe('admin/jellyfin/presets.get', () => {
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
        jellyfin_sync_enabled: 'true',
        jellyfin_default_library_access: 'all',
        jellyfin_default_video_transcoding: 'true',
        jellyfin_default_audio_transcoding: 'false',
        jellyfin_default_remuxing: 'true',
        jellyfin_default_live_tv_access: 'false',
        jellyfin_default_live_tv_management: 'true',
        jellyfin_default_max_active_sessions: '5'
      }
      return values[key] ?? ''
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({
      syncEnabled: true,
      libraryAccess: 'all',
      videoTranscoding: true,
      audioTranscoding: false,
      remuxing: true,
      liveTvAccess: false,
      liveTvManagement: true,
      maxActiveSessions: 5
    })
  })

  it('returns defaults when no settings', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockReturnValue('')

    const result = await handler(mockEvent)
    expect(result).toEqual({
      syncEnabled: true,
      libraryAccess: 'all',
      videoTranscoding: true,
      audioTranscoding: true,
      remuxing: true,
      liveTvAccess: true,
      liveTvManagement: false,
      maxActiveSessions: 0
    })
  })

  it('parses library access from JSON', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'jellyfin_default_library_access') return '["lib1","lib2"]'
      return ''
    })

    const result = await handler(mockEvent)
    expect(result.libraryAccess).toEqual(['lib1', 'lib2'])
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
