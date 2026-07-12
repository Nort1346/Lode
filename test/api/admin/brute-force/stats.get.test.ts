import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetBruteForceStats = vi.fn()

vi.stubGlobal('getBruteForceStats', mockGetBruteForceStats)

import handler from '#server/api/admin/brute-force/stats.get'

describe('admin/brute-force/stats.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetBruteForceStats.mockReset()
  })

  const mockEvent = {} as never

  it('returns brute-force stats for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetBruteForceStats.mockResolvedValue({
      blockedIpsCount: 5,
      recentAttempts24h: 100,
      recentFailed24h: 30,
      recentSuccess24h: 70
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({
      stats: { blockedIpsCount: 5, recentAttempts24h: 100, recentFailed24h: 30, recentSuccess24h: 70 }
    })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
