import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkJellyfinStatus } from '#server/utils/clients/jellyfin'

const mockFetch = vi.fn()

function okResponse(body: unknown = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => ''
  } as unknown as Response
}

function errorResponse(status: number, text: string) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text
  } as unknown as Response
}

function stubConfig(url: string, apiKey: string) {
  vi.stubGlobal(
    'useRuntimeConfig',
    vi.fn(() => ({ jellyfinUrl: url, jellyfinApiKey: apiKey }))
  )
}

describe('checkJellyfinStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns not_configured when url or key is missing', async () => {
    stubConfig('', '')

    await expect(checkJellyfinStatus()).resolves.toEqual({
      name: 'Jellyfin',
      configured: false,
      status: 'not_configured'
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns up with the server version on success', async () => {
    stubConfig('http://jellyfin:8096', 'key')
    mockFetch.mockResolvedValueOnce(okResponse({ Version: '10.9.0' }))

    await expect(checkJellyfinStatus()).resolves.toEqual({
      name: 'Jellyfin',
      configured: true,
      status: 'up',
      latencyMs: expect.any(Number),
      details: '10.9.0'
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://jellyfin:8096/System/Info',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'MediaBrowser Token="key"' })
      })
    )
  })

  it('returns up with undefined details when the version is missing', async () => {
    stubConfig('http://jellyfin:8096', 'key')
    mockFetch.mockResolvedValueOnce(okResponse({}))

    await expect(checkJellyfinStatus()).resolves.toEqual({
      name: 'Jellyfin',
      configured: true,
      status: 'up',
      latencyMs: expect.any(Number),
      details: undefined
    })
  })

  it('returns invalid when the API key is rejected (401/403)', async () => {
    stubConfig('http://jellyfin:8096', 'key')
    mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'))

    await expect(checkJellyfinStatus()).resolves.toEqual({
      name: 'Jellyfin',
      configured: true,
      status: 'invalid',
      latencyMs: expect.any(Number),
      details: 'API key rejected'
    })
  })

  it('returns error with the HTTP status on other non-ok responses', async () => {
    stubConfig('http://jellyfin:8096', 'key')
    mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal'))

    await expect(checkJellyfinStatus()).resolves.toEqual({
      name: 'Jellyfin',
      configured: true,
      status: 'error',
      latencyMs: expect.any(Number),
      details: 'HTTP 500'
    })
  })

  it('returns error for a malformed response body', async () => {
    stubConfig('http://jellyfin:8096', 'key')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json')
      },
      text: async () => 'not json'
    } as unknown as Response)

    await expect(checkJellyfinStatus()).resolves.toEqual({
      name: 'Jellyfin',
      configured: true,
      status: 'error',
      latencyMs: expect.any(Number),
      details: 'Malformed response'
    })
  })

  it('returns down when the request throws', async () => {
    stubConfig('http://jellyfin:8096', 'key')
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    await expect(checkJellyfinStatus()).resolves.toEqual({
      name: 'Jellyfin',
      configured: true,
      status: 'down',
      latencyMs: expect.any(Number)
    })
  })
})
