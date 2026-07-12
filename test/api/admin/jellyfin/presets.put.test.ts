import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockPutSetting = vi.hoisted(() => vi.fn())
const mockReadBody = vi.fn()

vi.mock('#server/utils/settings', () => ({
  putSetting: mockPutSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: {
    JELLYFIN_SYNC_ENABLED: 'jellyfin_sync_enabled',
    JELLYFIN_DEFAULT_LIBRARY_ACCESS: 'jellyfin_default_library_access',
    JELLYFIN_DEFAULT_VIDEO_TRANSCODING: 'jellyfin_default_video_transcoding',
    JELLYFIN_DEFAULT_AUDIO_TRANSCODING: 'jellyfin_default_audio_transcoding',
    JELLYFIN_DEFAULT_REMUXING: 'jellyfin_default_remuxing',
    JELLYFIN_DEFAULT_LIVE_TV_ACCESS: 'jellyfin_default_live_tv_access',
    JELLYFIN_DEFAULT_LIVE_TV_MANAGEMENT: 'jellyfin_default_live_tv_management',
    JELLYFIN_DEFAULT_MAX_ACTIVE_SESSIONS: 'jellyfin_default_max_active_sessions'
  }
}))

import handler from '#server/api/admin/jellyfin/presets.put'

describe('admin/jellyfin/presets.put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    mockPutSetting.mockReset()
    mockReadBody.mockReset()
  })

  const mockEvent = {} as never

  it('updates syncEnabled', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ syncEnabled: false })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_sync_enabled', 'false')
  })

  it('updates libraryAccess as all', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ libraryAccess: 'all' })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_default_library_access', 'all')
  })

  it('updates libraryAccess as array', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ libraryAccess: ['lib1', 'lib2'] })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_default_library_access', '["lib1","lib2"]')
  })

  it('updates all boolean fields', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({
      videoTranscoding: false,
      audioTranscoding: true,
      remuxing: false,
      liveTvAccess: true,
      liveTvManagement: false,
      maxActiveSessions: 10
    })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_default_video_transcoding', 'false')
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_default_audio_transcoding', 'true')
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_default_remuxing', 'false')
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_default_live_tv_access', 'true')
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_default_live_tv_management', 'false')
    expect(mockPutSetting).toHaveBeenCalledWith('jellyfin_default_max_active_sessions', '10')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
