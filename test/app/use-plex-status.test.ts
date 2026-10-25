import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()

import { usePlexStatus } from '../../app/composables/usePlexStatus'

describe('usePlexStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('$fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to null status and not loading', () => {
    const { status, loading } = usePlexStatus()
    expect(status.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('sets status from the API and clears loading', async () => {
    const up = { name: 'Plex', configured: true, status: 'up', latencyMs: 24, details: '1.43.3.10896' }
    mockFetch.mockResolvedValue(up)

    const { status, loading, refresh } = usePlexStatus()
    await refresh()

    expect(loading.value).toBe(false)
    expect(status.value).toEqual(up)
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/plex/status')
  })

  it('sets status to null and clears loading when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))

    const { status, loading, refresh } = usePlexStatus()
    await refresh()

    expect(status.value).toBeNull()
    expect(loading.value).toBe(false)
  })
})
