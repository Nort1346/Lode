import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAllTorrents = vi.fn()
vi.stubGlobal(
  'useQBittorrent',
  vi.fn(() => ({ getAllTorrents: mockGetAllTorrents }))
)

const mockSettingGet = vi.fn(() => undefined)
const mockActiveAll = vi.fn(() => [] as unknown[])
const mockUsersAll = vi.fn(() => [] as unknown[])
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockSet = vi.fn((_payload: unknown) => ({ where: vi.fn(() => ({ run: mockRun })) }))

let selectIndex = 0

const mockDb = {
  select: vi.fn((...args: unknown[]) => {
    if (args.length > 0) {
      return { from: vi.fn(() => ({ where: vi.fn(() => ({ get: mockSettingGet })) })) }
    }
    selectIndex++
    if (selectIndex === 1) {
      return { from: vi.fn(() => ({ where: vi.fn(() => ({ all: mockActiveAll })) })) }
    }
    return { from: vi.fn(() => ({ all: mockUsersAll })) }
  }),
  update: vi.fn(() => ({ set: mockSet }))
}

vi.stubGlobal('useDb', () => mockDb)

vi.mock('#server/database/schema', () => ({
  downloads: {
    id: 'id',
    userId: 'userId',
    status: 'status',
    torrentHash: 'torrentHash',
    torrentName: 'torrentName',
    sizeBytes: 'sizeBytes',
    downloadedBytes: 'downloadedBytes'
  },
  users: { id: 'id', username: 'username', discordId: 'discordId' },
  settings: { key: 'key', value: 'value' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/utils/notifications/discord', () => ({
  sendDownloadCompleteWebhook: vi.fn(() => Promise.resolve())
}))

vi.mock('#server/utils/notifications/notifications', () => ({
  notifyDownloadComplete: vi.fn(() => Promise.resolve())
}))

import { syncTorrentStatus } from '#server/utils/torrents/torrent-sync'

function makeDl(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dl-1',
    userId: 'u1',
    torrentHash: 'h1',
    torrentName: 'Movie 2024',
    magnetLink: '',
    label: '',
    posterUrl: '',
    tmdbId: 1,
    mediaType: 'movie',
    savePath: 'movies',
    sizeBytes: 1_000_000_000,
    downloadedBytes: 500_000_000,
    progress: 50,
    etaSeconds: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    numSeeds: 0,
    numLeechs: 0,
    status: 'downloading',
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeQbit(overrides: Record<string, unknown> = {}) {
  return {
    hash: 'h1',
    name: 'Movie 2024',
    progress: 0.5,
    eta: 1200,
    dlspeed: 5_000_000,
    dlspeed_avg: 1_000_000,
    upspeed: 100,
    size: 1_000_000_000,
    downloaded: 500_000_000,
    num_seeds: 5,
    num_complete: 5,
    num_leechs: 2,
    state: 'downloading',
    save_path: '',
    category: '',
    tags: '',
    added_on: 1,
    completion_on: 0,
    ...overrides
  }
}

describe('syncTorrentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectIndex = 0
  })

  it('uses average download speed for a stable ETA', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit()])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 0, failed: 0 })
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        etaSeconds: 500,
        downloadSpeed: 5_000_000,
        progress: 50
      })
    )
  })

  it('falls back to qBittorrent eta when no average speed yet', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ dlspeed_avg: 0, dlspeed: 0, eta: 900 })])

    await syncTorrentStatus()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ etaSeconds: 900 }))
  })

  it('stores zero eta when no speed data at all', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ dlspeed_avg: 0, dlspeed: 0, eta: 0 })])

    await syncTorrentStatus()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ etaSeconds: 0 }))
  })

  it('stores zero eta for qBittorrent unknown sentinel', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ dlspeed_avg: 0, dlspeed: 0, eta: 24000 })])

    await syncTorrentStatus()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ etaSeconds: 0 }))
  })

  it('stores zero eta when the average-speed estimate is unreliable', async () => {
    mockActiveAll.mockReturnValue([makeDl({ sizeBytes: 50_000_000_000, downloadedBytes: 0 })])
    mockGetAllTorrents.mockReturnValue([
      makeQbit({ size: 50_000_000_000, downloaded: 0, dlspeed_avg: 100, dlspeed: 100, eta: 24000 })
    ])

    await syncTorrentStatus()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ etaSeconds: 0 }))
  })

  it('marks torrent completed with eta 0', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockUsersAll.mockReturnValue([{ id: 'u1', username: 'user1', discordId: null }])
    mockGetAllTorrents.mockReturnValue([makeQbit({ progress: 1, completion_on: 1 })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 1, failed: 0 })
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        progress: 100,
        etaSeconds: 0
      })
    )
  })

  it('marks download failed when torrent is gone from qBittorrent', async () => {
    mockActiveAll.mockReturnValue([makeDl({ downloadedBytes: 0, torrentName: '' })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 1 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('does not mark downloads failed when the qBittorrent list is empty', async () => {
    mockActiveAll.mockReturnValue([makeDl({ downloadedBytes: 0 })])
    mockGetAllTorrents.mockReturnValue([])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0 })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('marks download completed when torrent is gone but progress is at or above 99.9%', async () => {
    mockActiveAll.mockReturnValue([makeDl({ torrentName: '', downloadedBytes: 999_500_000 })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 1, failed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', progress: 100 }))
  })

  it('recovers the torrent hash from the magnet link and backfills it', async () => {
    const recoveredHash = 'a'.repeat(40)
    mockActiveAll.mockReturnValue([
      makeDl({ torrentHash: null, torrentName: '', magnetLink: `magnet:?xt=urn:btih:${recoveredHash}` })
    ])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: recoveredHash, name: 'Recovered Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 0, failed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ torrentHash: recoveredHash }))
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ torrentName: 'Recovered Movie', progress: 50 }))
  })

  it('returns empty result without querying qBittorrent when no active downloads', async () => {
    mockActiveAll.mockReturnValue([])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0 })
    expect(mockGetAllTorrents).not.toHaveBeenCalled()
  })
})
