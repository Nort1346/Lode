import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()

import handler from '#server/api/admin/settings.get'

describe('admin/settings.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
  })

  const mockEvent = {} as never

  it('returns user settings for admin', async () => {
    mockGetUserSession.mockResolvedValue({
      user: { id: 'a1', role: 'admin', username: 'admin' },
      sessionId: 's1'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({ settings: { user: { id: 'a1', role: 'admin', username: 'admin' } } })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('throws 401 for unauthenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Unauthorized')
  })
})
