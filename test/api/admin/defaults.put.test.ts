import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const { mockPutSetting } = vi.hoisted(() => ({
  mockPutSetting: vi.fn()
}))

vi.mock('#server/utils/settings', () => ({
  putSetting: mockPutSetting
}))

const mockGetUserSession = vi.fn()

import handler from '#server/api/admin/defaults.put'

describe('admin/defaults.put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockReset()
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockPutSetting.mockReset()
    mockPutSetting.mockResolvedValue(undefined)
    vi.stubGlobal('readBody', vi.fn())
  })

  const mockEvent = {} as never

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({}))
    )

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('saves every provided field', async () => {
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({
        dailyDownloadLimit: 10,
        activeTorrentLimit: 2,
        maxTorrentSizeGb: 50,
        privateTrackerLimit: 1,
        maxSessions: 8,
        canSubmit: false
      }))
    )

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true })
    expect(mockPutSetting).toHaveBeenCalledTimes(6)
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_daily_download_limit', '10')
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_active_torrent_limit', '2')
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_max_torrent_size_gb', '50')
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_private_tracker_limit', '1')
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_max_sessions', '8')
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_can_submit', 'false')
  })

  it('only saves the fields that are provided', async () => {
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({ dailyDownloadLimit: 4, canSubmit: true }))
    )

    await handler(mockEvent)

    expect(mockPutSetting).toHaveBeenCalledTimes(2)
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_daily_download_limit', '4')
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_can_submit', 'true')
  })

  it('clamps negative limits to zero', async () => {
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({ dailyDownloadLimit: -5, maxSessions: -1 }))
    )

    await handler(mockEvent)

    expect(mockPutSetting).toHaveBeenCalledWith('user_default_daily_download_limit', '0')
    expect(mockPutSetting).toHaveBeenCalledWith('user_default_max_sessions', '0')
  })

  it('does nothing when the body is empty', async () => {
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({}))
    )

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true })
    expect(mockPutSetting).not.toHaveBeenCalled()
  })
})
