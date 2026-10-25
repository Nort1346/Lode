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
    PLEX_SYNC_ENABLED: 'plex_sync_enabled',
    PLEX_DEFAULT_LIBRARY_ACCESS: 'plex_default_library_access',
    PLEX_DEFAULT_LIVE_TV_ACCESS: 'plex_default_live_tv_access',
    PLEX_DEFAULT_SYNC: 'plex_default_sync'
  }
}))

import handler from '#server/api/admin/plex/presets.put'

describe('admin/plex/presets.put', () => {
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
    expect(mockPutSetting).toHaveBeenCalledWith('plex_sync_enabled', 'false')
  })

  it('updates libraryAccess as all', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ libraryAccess: 'all' })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('plex_default_library_access', 'all')
  })

  it('updates libraryAccess as array', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ libraryAccess: ['1', '2'] })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('plex_default_library_access', '["1","2"]')
  })

  it('updates liveTvAccess and sync booleans', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ liveTvAccess: false, sync: false })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('plex_default_live_tv_access', 'false')
    expect(mockPutSetting).toHaveBeenCalledWith('plex_default_sync', 'false')
  })

  it('writes nothing for absent fields', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({})

    await handler(mockEvent)
    expect(mockPutSetting).not.toHaveBeenCalled()
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
