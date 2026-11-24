import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockSet = vi.fn((_value?: Record<string, unknown>) => ({
  where: vi.fn(() => ({ get: vi.fn(), run: mockRun }))
}))
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
      set: mockSet
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
    expect(result).toEqual({
      id: 'dl-1',
      userId: 'u1',
      torrentHash: null,
      status: 'completed',
      etaSeconds: 0,
      etaState: 'calculating'
    })
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

  it('normalizes qBittorrent unknown eta to zero', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.1,
      completion_on: 0,
      downloaded: 100,
      size: 1000,
      eta: 24000,
      dlspeed: 512,
      upspeed: 0,
      state: 'downloading'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ etaSeconds: 0, status: 'downloading' }))
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

  it('completes when qBittorrent v5 reports stoppedUP', async () => {
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
      state: 'stoppedUP'
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
    expect(result).toEqual({
      id: 'dl-1',
      userId: 'u1',
      torrentHash: 'abc123',
      status: 'downloading',
      etaSeconds: 0,
      etaState: 'calculating'
    })
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

  it('marks paused when qBittorrent reports pausedDL', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.5,
      completion_on: 0,
      downloaded: 500,
      size: 1000,
      eta: 24000,
      dlspeed: 0,
      upspeed: 0,
      state: 'pausedDL'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        progress: 50,
        status: 'paused',
        etaSeconds: 0,
        downloadSpeed: 0,
        uploadSpeed: 0
      })
    )
    expect(mockRun).toHaveBeenCalled()
  })

  it('marks paused when qBittorrent v5 reports stoppedDL', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.5,
      completion_on: 0,
      downloaded: 500,
      size: 1000,
      eta: 24000,
      dlspeed: 0,
      upspeed: 0,
      state: 'stoppedDL'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        progress: 50,
        status: 'paused',
        etaSeconds: 0,
        downloadSpeed: 0,
        uploadSpeed: 0
      })
    )
    expect(mockRun).toHaveBeenCalled()
  })

  it('marks checking when qBittorrent reports checkingUP', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.8,
      completion_on: 0,
      downloaded: 800,
      size: 1000,
      eta: 120,
      dlspeed: 1024,
      upspeed: 512,
      state: 'checkingUP'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        progress: 80,
        status: 'checking',
        etaSeconds: 0,
        downloadSpeed: 0,
        uploadSpeed: 0
      })
    )
    expect(mockRun).toHaveBeenCalled()
  })

  it('does not mark complete while checkingUP reports completion_on > 0', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 1,
      completion_on: 1700000000,
      downloaded: 1000,
      size: 1000,
      eta: 0,
      dlspeed: 0,
      upspeed: 0,
      state: 'checkingUP'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        progress: 100,
        status: 'checking'
      })
    )
  })

  it('marks a paused row downloading again when qBittorrent resumed it', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'paused' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.5,
      completion_on: 0,
      downloaded: 500,
      size: 1000,
      eta: 120,
      dlspeed: 1024,
      upspeed: 0,
      state: 'downloading'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ status: 'downloading', downloadSpeed: 1024 }))
  })

  it('does not mark a metadata-fetching torrent complete when qBittorrent reports size 0', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'downloading' })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0,
      completion_on: 0,
      downloaded: 0,
      size: 0,
      eta: 0,
      dlspeed: 0,
      upspeed: 0,
      state: 'metaDL'
    })

    const result = await handler(mockEvent)

    expect(result).toEqual(expect.objectContaining({ progress: 0, status: 'downloading' }))
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ progress: 0, status: 'downloading' }))
  })

  it('sets completedAt only on the transition to completed', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({
      id: 'dl-1',
      userId: 'u1',
      torrentHash: 'abc123',
      status: 'downloading',
      completedAt: null
    })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 1,
      completion_on: 1700000000,
      downloaded: 1000,
      size: 1000,
      eta: 0,
      dlspeed: 0,
      upspeed: 1024,
      state: 'uploading'
    })

    await handler(mockEvent)

    const written = mockSet.mock.calls[0]?.[0]
    expect(written?.completedAt).toEqual(expect.any(String))
  })

  it('keeps the original completedAt when a completed row is polled again', async () => {
    const completedAt = '2024-01-02T03:04:05.000Z'
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'completed', completedAt })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 1,
      completion_on: 1700000000,
      downloaded: 1000,
      size: 1000,
      eta: 0,
      dlspeed: 0,
      upspeed: 1024,
      state: 'uploading'
    })

    await handler(mockEvent)

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', completedAt }))
  })

  it('does not clear completedAt when an incomplete read follows a completed row', async () => {
    const completedAt = '2024-01-02T03:04:05.000Z'
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', status: 'completed', completedAt })
    mockFindTorrentByHash.mockResolvedValue({
      progress: 0.5,
      completion_on: 0,
      downloaded: 500,
      size: 1000,
      eta: 120,
      dlspeed: 1024,
      upspeed: 0,
      state: 'downloading'
    })

    await handler(mockEvent)

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'downloading', completedAt }))
  })
})
