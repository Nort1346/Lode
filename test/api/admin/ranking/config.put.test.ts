import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockSaveRankingConfig = vi.fn()
const mockGetRankingConfig = vi.fn()
const mockLogActivity = vi.fn()
const mockReadBody = vi.fn()

vi.stubGlobal('saveRankingConfig', mockSaveRankingConfig)
vi.stubGlobal('getRankingConfig', mockGetRankingConfig)

import handler from '#server/api/admin/ranking/config.put'

describe('admin/ranking/config.put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('logActivity', mockLogActivity)
    vi.stubGlobal('readBody', mockReadBody)
    mockSaveRankingConfig.mockReset()
    mockGetRankingConfig.mockReset()
    mockLogActivity.mockReset()
    mockReadBody.mockReset()
  })

  const mockEvent = {} as never

  it('saves config and returns success for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    const config = { enabled: true, weightSeeders: 3 }
    mockReadBody.mockResolvedValue(config)
    mockSaveRankingConfig.mockResolvedValue(undefined)
    mockGetRankingConfig.mockResolvedValue(config)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, config })
    expect(mockSaveRankingConfig).toHaveBeenCalledWith(config)
    expect(mockLogActivity).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({
        action: 'ranking_config_update'
      })
    )
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
