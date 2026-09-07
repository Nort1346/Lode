import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()

import { useJellyfinStatus } from '../../app/composables/useJellyfinStatus'

describe('useJellyfinStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('$fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to null status and not loading', () => {
    const { status, loading } = useJellyfinStatus()
    expect(status.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('sets status from the API and clears loading', async () => {
    const up = { name: 'Jellyfin', configured: true, status: 'up', latencyMs: 10, details: '10.9.0' }
    mockFetch.mockResolvedValue(up)

    const { status, loading, refresh } = useJellyfinStatus()
    await refresh()

    expect(loading.value).toBe(false)
    expect(status.value).toEqual(up)
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/jellyfin/status')
  })

  it('sets status to null and clears loading when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))

    const { status, loading, refresh } = useJellyfinStatus()
    await refresh()

    expect(status.value).toBeNull()
    expect(loading.value).toBe(false)
  })
})
