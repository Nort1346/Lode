import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/admin/sync/libraries.get'

describe('admin/sync/libraries.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetActiveSyncProviders.mockReset()
  })

  const mockEvent = {} as never

  it('returns libraries from providers', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetActiveSyncProviders.mockResolvedValue([
      {
        name: 'jellyfin',
        getLibraries: vi.fn().mockResolvedValue([{ id: '1', name: 'Movies', path: '/movies' }])
      }
    ])

    const result = await handler(mockEvent)
    expect(result).toEqual([
      {
        name: 'jellyfin',
        enabled: true,
        libraries: [{ id: '1', name: 'Movies', path: '/movies' }]
      }
    ])
  })

  it('returns empty libraries on provider error', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetActiveSyncProviders.mockResolvedValue([
      {
        name: 'jellyfin',
        getLibraries: vi.fn().mockRejectedValue(new Error('Connection failed'))
      }
    ])

    const result = await handler(mockEvent)
    expect(result).toEqual([
      {
        name: 'jellyfin',
        enabled: true,
        libraries: []
      }
    ])
  })

  it('returns empty array when no providers', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetActiveSyncProviders.mockResolvedValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual([])
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
