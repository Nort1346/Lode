import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()

stubAdminAuth(mockGetUserSession)

let redisFail = false

vi.mock('ioredis', () => {
  function MockRedis(this: Record<string, unknown>) {
    if (redisFail) {
      this.connect = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    } else {
      this.connect = vi.fn().mockResolvedValue(undefined)
    }
    this.ping = vi.fn().mockResolvedValue('PONG')
    this.disconnect = vi.fn()
  }
  return { default: MockRedis }
})

import handler from '#server/api/admin/system-status.get'

function stubConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    qbittorrentUrl: 'http://qbit:8080',
    qbittorrentApiKey: 'qbit-key',
    prowlarrUrl: 'http://prowlarr:9696',
    prowlarrApiKey: 'prow-key',
    jellyfinUrl: 'http://jellyfin:8096',
    redisUrl: 'redis://localhost:6379',
    discordWebhookUrl: 'https://discord.com/api/webhooks/123',
    flaresolverrUrl: 'http://flaresolverr:8191'
  }
  vi.stubGlobal(
    'useRuntimeConfig',
    vi.fn(() => ({ ...defaults, ...overrides }))
  )
}

describe('admin/system-status.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubConfig()
    global.fetch = vi.fn()
  })

  const mockEvent = {} as never

  it('requires admin auth', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403')
  })

  it('returns all services up', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('2.0.0'),
      json: () => Promise.resolve({ Version: '10.9.0' })
    } as Response)

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('services')
    expect(result.services).toHaveLength(6)
    expect(result.services.every((s: { status: string }) => s.status === 'up')).toBe(true)
  })

  it('detects qBittorrent down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('qbit')) throw new Error('Connection refused')
      return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
    })

    const result = await handler(mockEvent)
    const qbit = result.services.find((s: { name: string }) => s.name === 'qBittorrent')
    expect(qbit).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })

  it('detects Prowlarr down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('prowlarr')) throw new Error('Connection refused')
      return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
    })

    const result = await handler(mockEvent)
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    expect(prowlarr).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })

  it('detects Jellyfin down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('jellyfin')) throw new Error('Connection refused')
      return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
    })

    const result = await handler(mockEvent)
    const jellyfin = result.services.find((s: { name: string }) => s.name === 'Jellyfin')
    expect(jellyfin).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })

  it('detects Discord down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('discord')) throw new Error('Connection refused')
      return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
    })

    const result = await handler(mockEvent)
    const discord = result.services.find((s: { name: string }) => s.name === 'Discord')
    expect(discord).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })

  it('detects FlareSolverr down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('flaresolverr')) throw new Error('Connection refused')
      return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
    })

    const result = await handler(mockEvent)
    const flaresolverr = result.services.find((s: { name: string }) => s.name === 'FlareSolverr')
    expect(flaresolverr).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })

  it('returns not_configured when URLs are empty', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    stubConfig({
      qbittorrentUrl: '',
      qbittorrentApiKey: '',
      prowlarrUrl: '',
      prowlarrApiKey: '',
      jellyfinUrl: '',
      redisUrl: '',
      discordWebhookUrl: '',
      flaresolverrUrl: ''
    })

    const result = await handler(mockEvent)
    expect(result.services).toHaveLength(6)
    expect(result.services.every((s: { status: string }) => s.status === 'not_configured')).toBe(true)
  })

  it('returns Jellyfin version when up', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('jellyfin')) return { ok: true, json: () => Promise.resolve({ Version: '10.9.0' }) } as Response
      return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
    })

    const result = await handler(mockEvent)
    const jellyfin = result.services.find((s: { name: string }) => s.name === 'Jellyfin')
    expect(jellyfin).toEqual(expect.objectContaining({ status: 'up', details: '10.9.0' }))
  })

  it('returns qBittorrent version when up', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('qbit'))
        return { ok: true, text: () => Promise.resolve('2.0.0'), json: () => Promise.resolve({}) } as Response
      return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
    })

    const result = await handler(mockEvent)
    const qbit = result.services.find((s: { name: string }) => s.name === 'qBittorrent')
    expect(qbit).toEqual(expect.objectContaining({ status: 'up', details: 'v2.0.0' }))
  })

  it('handles mixed statuses', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('qbit'))
        return { ok: true, text: () => Promise.resolve('v2.0.0'), json: () => Promise.resolve({}) } as Response
      if (u.includes('prowlarr')) throw new Error('Connection refused')
      if (u.includes('jellyfin')) return { ok: true, json: () => Promise.resolve({ Version: '10.9.0' }) } as Response
      if (u.includes('discord'))
        return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
      if (u.includes('flaresolverr')) throw new Error('Timeout')
      return { ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as Response
    })

    const result = await handler(mockEvent)
    const qbit = result.services.find((s: { name: string }) => s.name === 'qBittorrent')
    const prowlarr = result.services.find((s: { name: string }) => s.name === 'Prowlarr')
    const flaresolverr = result.services.find((s: { name: string }) => s.name === 'FlareSolverr')

    expect(qbit!.status).toBe('up')
    expect(prowlarr!.status).toBe('down')
    expect(flaresolverr!.status).toBe('down')
  })

  it('handles Redis not configured', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    stubConfig({ redisUrl: '' })

    const result = await handler(mockEvent)
    const redis = result.services.find((s: { name: string }) => s.name === 'Redis')
    expect(redis).toEqual(expect.objectContaining({ status: 'not_configured', configured: false }))
  })

  it('detects Redis down', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({})
    } as Response)

    redisFail = true
    const result = await handler(mockEvent)
    redisFail = false
    const redis = result.services.find((s: { name: string }) => s.name === 'Redis')
    expect(redis).toEqual(expect.objectContaining({ status: 'down', configured: true }))
  })
})
