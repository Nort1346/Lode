import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetBlockedIps = vi.fn()

vi.stubGlobal('getBlockedIps', mockGetBlockedIps)

import handler from '#server/api/admin/brute-force/blocked-ips.get'

describe('admin/brute-force/blocked-ips.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetBlockedIps.mockReset()
  })

  const mockEvent = {} as never

  it('returns blocked IPs for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetBlockedIps.mockResolvedValue([
      { ip: '1.2.3.4', expiresAt: Date.now() + 60000, attemptsCount: 10 },
      { ip: '5.6.7.8', expiresAt: Date.now() + 120000, attemptsCount: 5 }
    ])

    const result = await handler(mockEvent)
    expect(result).toEqual({
      blockedIps: [
        { ip: '1.2.3.4', expiresAt: expect.any(Number), attemptsCount: 10 },
        { ip: '5.6.7.8', expiresAt: expect.any(Number), attemptsCount: 5 }
      ]
    })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
