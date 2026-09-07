import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockCheckJellyfinStatus = vi.hoisted(() => vi.fn())
const mockGetUserSession = vi.fn()

vi.mock('#server/utils/clients/jellyfin', () => ({
  checkJellyfinStatus: mockCheckJellyfinStatus
}))

import handler from '#server/api/admin/jellyfin/status.get'

describe('admin/jellyfin/status.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
  })

  const mockEvent = {} as never

  it('returns the Jellyfin service status for an admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockCheckJellyfinStatus.mockResolvedValue({
      name: 'Jellyfin',
      configured: true,
      status: 'up',
      latencyMs: 12,
      details: '10.9.0'
    })

    const result = await handler(mockEvent)

    expect(mockCheckJellyfinStatus).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      name: 'Jellyfin',
      configured: true,
      status: 'up',
      latencyMs: 12,
      details: '10.9.0'
    })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
    expect(mockCheckJellyfinStatus).not.toHaveBeenCalled()
  })

  it('throws 401 when there is no session', async () => {
    mockGetUserSession.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('401: Unauthorized')
    expect(mockCheckJellyfinStatus).not.toHaveBeenCalled()
  })
})
