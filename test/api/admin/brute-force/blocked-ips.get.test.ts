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
    mockGetBlockedIps.mockResolvedValue(['1.2.3.4', '5.6.7.8'])

    const result = await handler(mockEvent)
    expect(result).toEqual({ blockedIps: ['1.2.3.4', '5.6.7.8'] })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
