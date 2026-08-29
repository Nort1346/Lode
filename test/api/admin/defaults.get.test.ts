import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const { mockGetSetting } = vi.hoisted(() => ({
  mockGetSetting: vi.fn()
}))

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

const mockGetUserSession = vi.fn()

import handler from '#server/api/admin/defaults.get'

describe('admin/defaults.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockReset()
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetSetting.mockReset()
    mockGetSetting.mockResolvedValue(undefined)
  })

  const mockEvent = {} as never

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('returns hardcoded defaults when no settings are stored', async () => {
    const result = await handler(mockEvent)

    expect(result).toEqual({
      dailyDownloadLimit: 5,
      activeTorrentLimit: 3,
      maxTorrentSizeGb: 20,
      privateTrackerLimit: 5,
      maxSessions: 0,
      canSubmit: false
    })
    expect(mockGetSetting).toHaveBeenCalledTimes(6)
  })

  it('returns stored values when settings exist', async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      const values: Record<string, string> = {
        user_default_daily_download_limit: '10',
        user_default_active_torrent_limit: '1',
        user_default_max_torrent_size_gb: '5',
        user_default_private_tracker_limit: '2',
        user_default_max_sessions: '7',
        user_default_can_submit: 'true'
      }
      return values[key]
    })

    const result = await handler(mockEvent)

    expect(result).toEqual({
      dailyDownloadLimit: 10,
      activeTorrentLimit: 1,
      maxTorrentSizeGb: 5,
      privateTrackerLimit: 2,
      maxSessions: 7,
      canSubmit: true
    })
  })
})
