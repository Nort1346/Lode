import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetRankingConfig = vi.fn()

vi.stubGlobal('getRankingConfig', mockGetRankingConfig)

import handler from '#server/api/admin/ranking/config.get'

describe('admin/ranking/config.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetRankingConfig.mockReset()
  })

  const mockEvent = {} as never

  it('returns ranking config for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRankingConfig.mockResolvedValue({ enabled: true, weightSeeders: 2 })

    const result = await handler(mockEvent)
    expect(result).toEqual({ config: { enabled: true, weightSeeders: 2 } })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
