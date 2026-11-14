import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockCheckPlexStatus = vi.hoisted(() => vi.fn())
const mockGetUserSession = vi.fn()

vi.mock('#server/utils/clients/plex', () => ({
  checkPlexStatus: mockCheckPlexStatus
}))

import handler from '#server/api/admin/plex/status.get'

describe('admin/plex/status.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
  })

  const mockEvent = {} as never

  it('returns the Plex service status for an admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockCheckPlexStatus.mockResolvedValue({
      name: 'Plex',
      configured: true,
      status: 'up',
      latencyMs: 24,
      details: '1.43.3.10896'
    })

    const result = await handler(mockEvent)

    expect(mockCheckPlexStatus).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      name: 'Plex',
      configured: true,
      status: 'up',
      latencyMs: 24,
      details: '1.43.3.10896'
    })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
    expect(mockCheckPlexStatus).not.toHaveBeenCalled()
  })

  it('throws 401 when there is no session', async () => {
    mockGetUserSession.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('401: Unauthorized')
    expect(mockCheckPlexStatus).not.toHaveBeenCalled()
  })
})
