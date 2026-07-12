import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/admin/sync/providers.get'

describe('admin/sync/providers.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetActiveSyncProviders.mockReset()
  })

  const mockEvent = {} as never

  it('returns active providers for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetActiveSyncProviders.mockResolvedValue([{ name: 'jellyfin' }])

    const result = await handler(mockEvent)
    expect(result).toEqual({
      providers: [{ name: 'jellyfin', enabled: true }],
      jellyfinConfigured: true
    })
  })

  it('returns empty providers when none configured', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetActiveSyncProviders.mockResolvedValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual({ providers: [], jellyfinConfigured: false })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
