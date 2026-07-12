import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetBruteForceConfig = vi.fn()

vi.stubGlobal('getBruteForceConfig', mockGetBruteForceConfig)

import handler from '#server/api/admin/brute-force/config.get'

describe('admin/brute-force/config.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetBruteForceConfig.mockReset()
  })

  const mockEvent = {} as never

  it('returns brute-force config for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetBruteForceConfig.mockResolvedValue({ maxAttempts: 5, windowMs: 60000 })

    const result = await handler(mockEvent)
    expect(result).toEqual({ config: { maxAttempts: 5, windowMs: 60000 } })
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
