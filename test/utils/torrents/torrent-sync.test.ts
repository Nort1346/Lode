import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAllTorrents = vi.fn()
vi.stubGlobal(
  'useQBittorrent',
  vi.fn(() => ({ getAllTorrents: mockGetAllTorrents }))
)

const mockSettingGet = vi.fn((_cond?: { key?: string }) => undefined as { value: string } | undefined)
const mockGetSetting = vi.hoisted(() => vi.fn((_key?: string) => undefined as string | undefined))
const mockActiveAll = vi.fn(() => [] as unknown[])
const mockUsersAll = vi.fn(() => [] as unknown[])
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockSet = vi.fn((_payload: unknown) => ({ where: vi.fn(() => ({ run: mockRun })) }))
const mockSendWebhook = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockNotifyDownloadComplete = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockUseJellyfin = vi.hoisted(() => vi.fn(() => null as unknown))
const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}))

const mockSchema = vi.hoisted(() => ({
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

const mockDb = {
  select: vi.fn((...args: unknown[]) => {
    if (args.length > 0) {
      return {
        from: vi.fn(() => ({
          where: vi.fn((cond: { key?: string }) => ({ get: vi.fn(() => mockSettingGet(cond)) }))
        }))
      }
    }
    return {
      from: vi.fn((table: unknown) =>
        table === mockSchema.downloads ? { where: vi.fn(() => ({ all: mockActiveAll })) } : { all: mockUsersAll }
      )
    }
  }),
  update: vi.fn(() => ({ set: mockSet }))
}

vi.stubGlobal('useDb', () => mockDb)
vi.stubGlobal('useJellyfin', mockUseJellyfin)
vi.stubGlobal('useRuntimeConfig', () => ({
  savePathMovies: '/data/movies',
  savePathSeries: '/data/series',
  savePathGames: '/data/games',
  savePathBooks: '/data/books',
  savePathMusic: '/data/music'
}))

vi.mock('#server/database/schema', () => mockSchema)

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val?: string) => ({ key: val }))
}))

vi.mock('#server/utils/notifications/discord', () => ({
  sendDownloadCompleteWebhook: mockSendWebhook
}))

vi.mock('#server/utils/notifications/notifications', () => ({
  notifyDownloadComplete: mockNotifyDownloadComplete
}))

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => mockLog)
}))

import { syncTorrentStatus, notifyJellyfinIfNeeded, resetSyncDiagnostics } from '#server/utils/torrents/torrent-sync'

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
    mockGetSetting.mockReset()
    resetSyncDiagnostics()
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

  it('marks download completed when the torrent disappears at 90% progress with auto-remove enabled', async () => {
    mockGetSetting.mockReturnValueOnce('true')
    mockActiveAll.mockReturnValue([makeDl({ torrentName: '', downloadedBytes: 900_000_000 })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 1, failed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', progress: 100 }))
  })

  it('still marks download failed when the torrent disappears below 90% progress with auto-remove enabled', async () => {
    mockGetSetting.mockReturnValueOnce('true')
    mockActiveAll.mockReturnValue([makeDl({ torrentName: '', downloadedBytes: 800_000_000 })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 1 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
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

  it('matches the torrent by name when the hash is missing and backfills the hash', async () => {
    mockActiveAll.mockReturnValue([makeDl({ torrentName: 'Movie 2024', downloadedBytes: 500_000_000 })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'h2', name: 'Movie 2024 REMAKE', progress: 0.5 })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 0, failed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ torrentHash: 'h2' }))
  })

  it('returns early without updates when the qBittorrent fetch fails', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockRejectedValueOnce(new Error('offline'))

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0 })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('logs the first sync after start with swarm counts', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit(), makeQbit({ hash: 'h2', name: 'Other', num_complete: 0 })])

    await syncTorrentStatus()

    expect(mockLog.info).toHaveBeenCalledWith(
      'first sync after start: 2 torrent(s) in qBittorrent, 1 with num_complete=0, 1 active download(s)'
    )

    await syncTorrentStatus()

    expect(mockLog.info).toHaveBeenCalledTimes(1)
  })

  it('warns when seeders are zero while the torrent is still downloading', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ num_seeds: 0, num_complete: 0, dlspeed: 5_000_000 })])

    await syncTorrentStatus()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ numSeeds: 0 }))
    expect(mockLog.warn).toHaveBeenCalledWith(
      'zero seeders while actively downloading: id=dl-1 hash=h1 name="Movie 2024" num_seeds=0 num_complete=0 dlspeed=5000000 progress=50.0% state=downloading'
    )
  })

  it('warns only once per zero-seeder episode', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ num_seeds: 0, num_complete: 0, dlspeed: 5_000_000 })])

    await syncTorrentStatus()
    await syncTorrentStatus()
    await syncTorrentStatus()

    expect(mockLog.warn).toHaveBeenCalledTimes(1)
  })

  it('does not warn for zero seeders when the torrent is not downloading', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ num_seeds: 0, num_complete: 0, dlspeed: 0, dlspeed_avg: 0 })])

    await syncTorrentStatus()

    expect(mockLog.warn).not.toHaveBeenCalled()
  })

  it('logs when seeders return after a zero-seeder episode', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ num_seeds: 0, num_complete: 0, dlspeed: 5_000_000 })])
    await syncTorrentStatus()
    mockGetAllTorrents.mockReturnValue([makeQbit()])
    await syncTorrentStatus()

    expect(mockLog.info).toHaveBeenCalledWith('seeders restored: id=dl-1 hash=h1 num_seeds=5 num_complete=5')
  })

  it('warns when a torrent is matched by name instead of hash', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'h2', name: 'Movie 2024 REMAKE' })])

    await syncTorrentStatus()

    expect(mockLog.warn).toHaveBeenCalledWith(
      'matched torrent by name instead of hash: id=dl-1 hash=h1 name="Movie 2024" matched_hash=h2 matched_name="Movie 2024 REMAKE"'
    )
  })
})

describe('notifyJellyfinIfNeeded', () => {
  const mockJellyfin = {
    notifyMediaUpdated: vi.fn(() => Promise.resolve()),
    invalidateLibraryCache: vi.fn()
  }

  // A fixed point in the past so the prep-delay comparison is deterministic
  const completedAtPast = () => new Date(Date.now() - 60_000).toISOString()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSetting.mockReset()
    mockSettingGet.mockReset()
    mockUseJellyfin.mockReset()
    mockUseJellyfin.mockReturnValue(null)
    mockJellyfin.notifyMediaUpdated.mockReset()
    mockJellyfin.notifyMediaUpdated.mockResolvedValue(undefined)
    mockJellyfin.invalidateLibraryCache.mockReset()
  })

  it('returns early when no completed downloads have a completedAt', async () => {
    mockActiveAll.mockReturnValue([makeDl({ status: 'completed', completedAt: null })])

    await notifyJellyfinIfNeeded()

    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('clears completedAt and skips notifications when the countdown is disabled and Jellyfin is absent', async () => {
    mockActiveAll.mockReturnValue([makeDl({ status: 'completed', completedAt: completedAtPast() })])
    mockUsersAll.mockReturnValue([{ id: 'u1', username: 'user1', discordId: null }])

    await notifyJellyfinIfNeeded()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ completedAt: null }))
    expect(mockSendWebhook).not.toHaveBeenCalled()
    expect(mockNotifyDownloadComplete).not.toHaveBeenCalled()
  })

  it('notifies Jellyfin and invalidates the library cache once the prep countdown elapses', async () => {
    mockSettingGet.mockImplementation((cond: { key?: string } | undefined) =>
      cond?.key === 'prep_countdown_enabled' ? { value: 'true' } : { value: '10' }
    )
    mockUseJellyfin.mockReturnValue(mockJellyfin)
    mockActiveAll.mockReturnValue([
      makeDl({ status: 'completed', completedAt: completedAtPast(), savePath: 'movies', sizeBytes: 100 })
    ])
    mockUsersAll.mockReturnValue([{ id: 'u1', username: 'user1', discordId: null }])

    await notifyJellyfinIfNeeded()

    expect(mockJellyfin.notifyMediaUpdated).toHaveBeenCalledWith(['/data/movies'])
    expect(mockJellyfin.invalidateLibraryCache).toHaveBeenCalled()
    expect(mockSendWebhook).toHaveBeenCalledTimes(1)
    expect(mockNotifyDownloadComplete).toHaveBeenCalledTimes(1)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ completedAt: null }))
  })

  it('waits out the prep countdown before notifying', async () => {
    mockSettingGet.mockImplementation((cond: { key?: string } | undefined) =>
      cond?.key === 'prep_countdown_enabled' ? { value: 'true' } : { value: '10' }
    )
    mockUseJellyfin.mockReturnValue(mockJellyfin)
    mockActiveAll.mockReturnValue([
      makeDl({
        status: 'completed',
        completedAt: completedAtPast(),
        savePath: 'movies',
        sizeBytes: 100 * 1024 ** 3
      })
    ])

    await notifyJellyfinIfNeeded()

    expect(mockJellyfin.notifyMediaUpdated).not.toHaveBeenCalled()
    expect(mockJellyfin.invalidateLibraryCache).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('clears completedAt without notifying when the save path is unknown', async () => {
    mockUseJellyfin.mockReturnValue(mockJellyfin)
    mockActiveAll.mockReturnValue([
      makeDl({ status: 'completed', completedAt: completedAtPast(), savePath: 'unknown' })
    ])

    await notifyJellyfinIfNeeded()

    expect(mockJellyfin.notifyMediaUpdated).not.toHaveBeenCalled()
    expect(mockJellyfin.invalidateLibraryCache).not.toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ completedAt: null }))
  })

  it('survives a rejected Jellyfin notification', async () => {
    mockUseJellyfin.mockReturnValue(mockJellyfin)
    mockJellyfin.notifyMediaUpdated.mockRejectedValueOnce(new Error('jellyfin down'))
    mockActiveAll.mockReturnValue([makeDl({ status: 'completed', completedAt: completedAtPast(), savePath: 'movies' })])

    await expect(notifyJellyfinIfNeeded()).resolves.toBeUndefined()

    expect(mockJellyfin.invalidateLibraryCache).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ completedAt: null }))
  })

  it('sends Discord and push notifications when the countdown is enabled but Jellyfin is absent', async () => {
    mockSettingGet.mockImplementation((cond: { key?: string } | undefined) =>
      cond?.key === 'prep_countdown_enabled' ? { value: 'true' } : { value: '10' }
    )
    mockUseJellyfin.mockReturnValue(null)
    mockActiveAll.mockReturnValue([
      makeDl({ status: 'completed', completedAt: completedAtPast(), savePath: 'movies', sizeBytes: 100 })
    ])
    mockUsersAll.mockReturnValue([{ id: 'u1', username: 'user1', discordId: '999' }])

    await notifyJellyfinIfNeeded()

    expect(mockSendWebhook).toHaveBeenCalledTimes(1)
    expect(mockNotifyDownloadComplete).toHaveBeenCalledTimes(1)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ completedAt: null }))
  })
})
