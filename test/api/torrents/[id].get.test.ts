import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn()
const mockFindTorrentByHash = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'getRouterParam',
  vi.fn((_event: unknown, key: string) => (key === 'id' ? 'dl-1' : undefined))
)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ run: mockRun }))
      }))
    }))
  }))
)
vi.stubGlobal(
  'useQBittorrent',
  vi.fn(() => ({
    findTorrentByHash: mockFindTorrentByHash
  }))
)

vi.mock('#server/database/schema', () => ({
  downloads: { id: 'id', userId: 'userId', torrentHash: 'torrentHash', torrentName: 'torrentName', status: 'status' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

import handler from '#server/api/torrents/[id].get'

describe('torrents/[id].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns download without torrent hash', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: null, status: 'completed' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ id: 'dl-1', userId: 'u1', torrentHash: null, status: 'completed' })
    expect(mockFindTorrentByHash).not.toHaveBeenCalled()
  })

  it('enriches data from qBittorrent (incomplete)', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.5,
      completion_on: 0,
      downloaded: 500,
      size: 1000,
      eta: 120,
      dlspeed: 1024,
      upspeed: 512,
      state: 'downloading'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        progress: 50,
        status: 'downloading'
      })
    )
    expect(mockRun).toHaveBeenCalled()
  })

  it('marks complete via completion_on > 0', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.95,
      completion_on: 1700000000,
      downloaded: 950,
      size: 1000,
      eta: 0,
      dlspeed: 0,
      upspeed: 1024,
      state: 'uploading'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        progress: 100,
        status: 'completed'
      })
    )
  })

  it('marks complete via progress >= 99.9%', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.999,
      completion_on: 0,
      downloaded: 999,
      size: 1000,
      eta: 1,
      dlspeed: 10,
      upspeed: 0,
      state: 'downloading'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        progress: 100,
        status: 'completed'
      })
    )
  })

  it('marks complete via completed state', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.8,
      completion_on: 0,
      downloaded: 800,
      size: 1000,
      eta: 0,
      dlspeed: 0,
      upspeed: 512,
      state: 'stalledUP'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        progress: 100,
        status: 'completed'
      })
    )
  })

  it('falls back to DB data on qBittorrent error', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockRejectedValue(new Error('Connection refused'))

    const result = await handler(mockEvent)
    expect(result).toEqual({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
  })

  it('throws 403 for unauthorized user', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'other', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: null, status: 'completed' })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('allows admin to access other user download', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: null, status: 'completed' })

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ id: 'dl-1' }))
  })
})
