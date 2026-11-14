import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()

import { usePlexConfigured } from '../../app/composables/usePlexConfigured'

describe('usePlexConfigured', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('$fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to not configured and not loading', () => {
    const { configured, loading } = usePlexConfigured()
    expect(configured.value).toBe(false)
    expect(loading.value).toBe(false)
  })

  it('sets configured to true when the API reports it', async () => {
    mockFetch.mockResolvedValue({ plexConfigured: true })

    const { configured, loading, refresh } = usePlexConfigured()
    await refresh()

    expect(loading.value).toBe(false)
    expect(configured.value).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/sync/providers')
  })

  it('sets configured to false when the API reports it is not configured', async () => {
    mockFetch.mockResolvedValue({ plexConfigured: false })

    const { configured, refresh } = usePlexConfigured()
    await refresh()

    expect(configured.value).toBe(false)
  })

  it('sets configured to false when the response shape is unexpected', async () => {
    mockFetch.mockResolvedValue({})

    const { configured, refresh } = usePlexConfigured()
    await refresh()

    expect(configured.value).toBe(false)
  })

  it('sets configured to false and clears loading when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))

    const { configured, loading, refresh } = usePlexConfigured()
    await refresh()

    expect(configured.value).toBe(false)
    expect(loading.value).toBe(false)
  })
})
