import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubUserAuth } from '../helpers'

const mockGetUserSession = vi.fn()

stubUserAuth(mockGetUserSession)

function stubConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    qbittorrentUrl: 'http://qbit:8080',
    qbittorrentApiKey: 'qbit-key',
    prowlarrUrl: 'http://prowlarr:9696',
    prowlarrApiKey: 'prow-key',
    tmdbApiKey: 'tmdb-key'
  }
  vi.stubGlobal(
    'useRuntimeConfig',
    vi.fn(() => ({ ...defaults, ...overrides }))
  )
}

import handler from '#server/api/health/services.get'

const mockEvent = {} as never

function okResponse(body: { text?: string; json?: unknown }) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(body.text ?? ''),
    json: () => Promise.resolve(body.json ?? {})
  } as Response
}

describe('health/services.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubConfig()
    global.fetch = vi.fn()
  })

  it('requires authentication', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401')
  })

  it('works for a non-admin user', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr') && u.includes('indexers')) return okResponse({ json: [{ enable: true }] })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    expect(result.services.map((s: { name: string }) => s.name).sort()).toEqual(['Prowlarr', 'TMDB', 'qBittorrent'])
    expect(result.services.every((s: { status: string }) => s.status === 'up')).toBe(true)
  })

  it('returns all three services up with enabled indexers', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr') && u.includes('indexers'))
        return okResponse({ json: [{ enable: true }, { enable: false }] })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    expect(result.services).toHaveLength(3)
    expect(result.services.every((s: { status: string }) => s.status === 'up')).toBe(true)
  })

  it('detects TMDB down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('themoviedb')) throw new Error('Connection refused')
      if (String(url).includes('prowlarr') && String(url).includes('indexers'))
        return okResponse({ json: [{ enable: true }] })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const tmdb = result.services.find((s: { name: string }) => s.name === 'TMDB')
    expect(tmdb).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })

  it('detects invalid TMDB API key (401)', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('themoviedb')) {
        return { ok: false, status: 401, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
      }
      if (String(url).includes('prowlarr') && String(url).includes('indexers'))
        return okResponse({ json: [{ enable: true }] })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const tmdb = result.services.find((s: { name: string }) => s.name === 'TMDB')
    expect(tmdb).toEqual(expect.objectContaining({ status: 'invalid', configured: true }))
  })

  it('detects qBittorrent down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('qbit')) throw new Error('Connection refused')
      if (u.includes('prowlarr') && u.includes('indexers')) return okResponse({ json: [{ enable: true }] })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const qbit = result.services.find((s: { name: string }) => s.name === 'qBittorrent')
    expect(qbit).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })

  it('detects invalid qBittorrent API key (403)', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('qbit')) {
        return {
          ok: false,
          status: 403,
          text: () => Promise.resolve('Forbidden'),
          json: () => Promise.resolve({})
        } as Response
      }
      if (u.includes('prowlarr') && u.includes('indexers')) return okResponse({ json: [{ enable: true }] })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const qbit = result.services.find((s: { name: string }) => s.name === 'qBittorrent')
    expect(qbit).toEqual(expect.objectContaining({ status: 'invalid', configured: true, details: 'API key rejected' }))
  })

  it('returns qBittorrent not_configured when the URL is empty', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    stubConfig({ qbittorrentUrl: '', qbittorrentApiKey: '' })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('prowlarr') && String(url).includes('indexers'))
        return okResponse({ json: [{ enable: true }] })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const qbit = result.services.find((s: { name: string }) => s.name === 'qBittorrent')
    expect(qbit).toEqual(expect.objectContaining({ status: 'not_configured', configured: false }))
  })

  it('detects Prowlarr down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr')) throw new Error('Connection refused')
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    expect(prowlarr).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })

  it('detects invalid Prowlarr API key (401)', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr')) {
        return { ok: false, status: 401, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
      }
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    expect(prowlarr).toEqual(expect.objectContaining({ status: 'invalid', configured: true }))
  })

  it('reports no_indexers when the indexer list is empty', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr') && u.includes('indexers')) return okResponse({ json: [] })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    expect(prowlarr).toEqual(expect.objectContaining({ status: 'no_indexers', configured: true }))
  })

  it('reports no_indexers when all indexers are disabled', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr') && u.includes('indexers')) {
        return okResponse({ json: [{ enable: false }, { enable: false }, { name: 'Broken' }] })
      }
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    expect(prowlarr).toEqual(expect.objectContaining({ status: 'no_indexers', configured: true }))
  })

  it('stays up when the indexer list is not an array', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr') && u.includes('indexers')) return okResponse({ json: { Version: '10.9.0' } })
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    expect(prowlarr).toEqual(expect.objectContaining({ status: 'up' }))
  })

  it('stays up when the indexer list cannot be parsed', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr') && u.includes('indexers')) {
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve('<html>not json</html>'),
          json: () => Promise.reject(new Error('Unexpected token <'))
        } as Response
      }
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    expect(prowlarr).toEqual(expect.objectContaining({ status: 'up' }))
  })

  it('stays up when the indexer endpoint errors', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr') && u.includes('indexers')) {
        return { ok: false, status: 500, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
      }
      return okResponse({ text: 'v5.2.3' })
    })

    const result = await handler(mockEvent)
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    expect(prowlarr).toEqual(expect.objectContaining({ status: 'up' }))
  })
})
