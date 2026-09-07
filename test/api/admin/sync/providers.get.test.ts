import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/admin/sync/providers.get'

function stubConfig(overrides: Record<string, string | boolean> = {}) {
  const defaults: Record<string, string | boolean> = {
    jellyfinUrl: 'http://jellyfin:8096',
    jellyfinApiKey: 'jelly-key',
    jellyfinSyncEnabled: false
  }
  vi.stubGlobal(
    'useRuntimeConfig',
    vi.fn(() => ({ ...defaults, ...overrides }))
  )
}

describe('admin/sync/providers.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetActiveSyncProviders.mockReset()
    stubConfig()
  })

  const mockEvent = {} as never

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('reports jellyfinConfigured from config, not from active providers', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    stubConfig()
    mockGetActiveSyncProviders.mockResolvedValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual({ providers: [], jellyfinConfigured: true })
  })

  it('reports jellyfinConfigured even when sync is disabled', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    stubConfig({ jellyfinSyncEnabled: false })
    mockGetActiveSyncProviders.mockResolvedValue([])

    const result = await handler(mockEvent)
    expect(result.jellyfinConfigured).toBe(true)
  })

  it('reports jellyfinConfigured false when the URL is missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    stubConfig({ jellyfinUrl: '' })
    mockGetActiveSyncProviders.mockResolvedValue([])

    const result = await handler(mockEvent)
    expect(result.jellyfinConfigured).toBe(false)
  })

  it('reports jellyfinConfigured false when the API key is missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    stubConfig({ jellyfinApiKey: '' })
    mockGetActiveSyncProviders.mockResolvedValue([])

    const result = await handler(mockEvent)
    expect(result.jellyfinConfigured).toBe(false)
  })

  it('still lists active providers independent of configuration', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    stubConfig()
    mockGetActiveSyncProviders.mockResolvedValue([{ name: 'jellyfin' }])

    const result = await handler(mockEvent)
    expect(result).toEqual({
      providers: [{ name: 'jellyfin', enabled: true }],
      jellyfinConfigured: true
    })
  })
})
