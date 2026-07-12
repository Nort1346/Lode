import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockResetRankingConfig = vi.fn()
const mockGetRankingConfig = vi.fn()
const mockLogActivity = vi.fn()

vi.stubGlobal('resetRankingConfig', mockResetRankingConfig)
vi.stubGlobal('getRankingConfig', mockGetRankingConfig)

import handler from '#server/api/admin/ranking/config.reset.post'

describe('admin/ranking/config.reset.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('logActivity', mockLogActivity)
    mockResetRankingConfig.mockReset()
    mockGetRankingConfig.mockReset()
    mockLogActivity.mockReset()
  })

  const mockEvent = {} as never

  it('resets config and returns defaults for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockResetRankingConfig.mockResolvedValue(undefined)
    mockGetRankingConfig.mockResolvedValue({ enabled: true })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, config: { enabled: true } })
    expect(mockResetRankingConfig).toHaveBeenCalled()
    expect(mockLogActivity).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({
        action: 'ranking_config_reset'
      })
    )
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
