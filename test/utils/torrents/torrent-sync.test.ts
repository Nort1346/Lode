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
  eq: vi.fn((_col: unknown, val?: string) => ({ key: val })),
  inArray: vi.fn((_col: unknown, vals?: unknown[]) => ({ in: vals }))
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
    notifiedAt: null,
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

    expect(result).toEqual({ synced: 1, completed: 0, failed: 0, removed: 0 })
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

    expect(result).toEqual({ synced: 1, completed: 1, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        progress: 100,
        etaSeconds: 0
      })
    )
  })

  it('marks torrent paused when qBittorrent reports pausedDL', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ state: 'pausedDL', dlspeed: 0, dlspeed_avg: 0, upspeed: 0 })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 0, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'paused',
        progress: 50,
        etaSeconds: 0,
        downloadSpeed: 0,
        uploadSpeed: 0
      })
    )
    expect(mockNotifyDownloadComplete).not.toHaveBeenCalled()
  })

  it('resumes a paused row when qBittorrent is downloading again', async () => {
    mockActiveAll.mockReturnValue([makeDl({ status: 'paused' })])
    mockGetAllTorrents.mockReturnValue([makeQbit()])

    await syncTorrentStatus()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'downloading' }))
  })

  it('logs when sync transitions a torrent between downloading and paused', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ state: 'pausedDL', dlspeed: 0, dlspeed_avg: 0, upspeed: 0 })])
    await syncTorrentStatus()
    expect(mockLog.info).toHaveBeenCalledWith('status changed: downloading -> paused: id=dl-1 hash=h1 state=pausedDL')

    mockActiveAll.mockReturnValue([makeDl({ status: 'paused' })])
    mockGetAllTorrents.mockReturnValue([makeQbit()])
    await syncTorrentStatus()
    expect(mockLog.info).toHaveBeenCalledWith(
      'status changed: paused -> downloading: id=dl-1 hash=h1 state=downloading'
    )
  })

  it('does not log a status change when the status is unchanged', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit()])

    await syncTorrentStatus()

    expect(mockLog.info).not.toHaveBeenCalledWith(expect.stringContaining('status changed'))
  })

  it('completes and notifies a paused row that finished while paused', async () => {
    mockActiveAll.mockReturnValue([makeDl({ status: 'paused' })])
    mockUsersAll.mockReturnValue([{ id: 'u1', username: 'user1', discordId: null }])
    mockGetAllTorrents.mockReturnValue([makeQbit({ state: 'pausedUP', progress: 1, completion_on: 1 })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 1, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', progress: 100 }))
    expect(mockNotifyDownloadComplete).toHaveBeenCalledTimes(1)
  })

  it('marks a paused row removed when the torrent vanished from qBittorrent', async () => {
    mockActiveAll.mockReturnValue([makeDl({ status: 'paused' })])
    mockGetAllTorrents.mockReturnValue([])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0, removed: 1 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed' }))
  })

  it('notifies each concurrently completed download with its own metadata', async () => {
    mockActiveAll.mockReturnValue([
      makeDl({
        id: 'dl-avengers',
        torrentHash: 'h-avengers',
        torrentName: 'Avengers 2012',
        label: 'Avengers',
        posterUrl: 'https://image.tmdb.org/p/avengers.jpg',
        tmdbId: 299536
      }),
      makeDl({
        id: 'dl-sheep',
        torrentHash: 'h-sheep',
        torrentName: 'The Sheep Detectives 2023',
        label: 'The Sheep Detectives',
        posterUrl: 'https://image.tmdb.org/p/sheep.jpg',
        tmdbId: 123456
      })
    ])
    mockGetAllTorrents.mockReturnValue([
      makeQbit({ hash: 'h-avengers', name: 'Avengers 2012', progress: 1, completion_on: 1 }),
      makeQbit({ hash: 'h-sheep', name: 'The Sheep Detectives 2023', progress: 1, completion_on: 1 })
    ])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 2, completed: 2, failed: 0, removed: 0 })
    expect(mockNotifyDownloadComplete).toHaveBeenCalledTimes(2)
    expect(mockNotifyDownloadComplete).toHaveBeenCalledWith(
      'u1',
      'dl-avengers',
      'movie',
      'Avengers',
      'https://image.tmdb.org/p/avengers.jpg',
      expect.any(Number),
      'movies',
      299536
    )
    expect(mockNotifyDownloadComplete).toHaveBeenCalledWith(
      'u1',
      'dl-sheep',
      'movie',
      'The Sheep Detectives',
      'https://image.tmdb.org/p/sheep.jpg',
      expect.any(Number),
      'movies',
      123456
    )
  })

  it('marks download removed when a confirmed torrent is gone from qBittorrent', async () => {
    mockActiveAll.mockReturnValue([makeDl({ downloadedBytes: 0, torrentName: '' })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0, removed: 1 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed' }))
  })

  it('marks download failed when the torrent never appeared in qBittorrent', async () => {
    mockActiveAll.mockReturnValue([makeDl({ torrentHash: null, torrentName: '', progress: 0, downloadedBytes: 0 })])
    mockGetAllTorrents.mockReturnValue([])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 1, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('marks download completed when the qBittorrent list is empty and progress is at or above 99.9%', async () => {
    mockActiveAll.mockReturnValue([makeDl({ torrentName: '', downloadedBytes: 999_500_000 })])
    mockGetAllTorrents.mockReturnValue([])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 1, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', progress: 100 }))
  })

  it('marks download completed when the last torrent was auto-removed at 95% progress', async () => {
    mockGetSetting.mockReturnValueOnce('true')
    mockActiveAll.mockReturnValue([makeDl({ torrentName: '', downloadedBytes: 950_000_000 })])
    mockGetAllTorrents.mockReturnValue([])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 1, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', progress: 100, completedAt: expect.any(String) })
    )
  })

  it('marks download completed when torrent is gone but progress is at or above 99.9%', async () => {
    mockActiveAll.mockReturnValue([makeDl({ torrentName: '', downloadedBytes: 999_500_000 })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 1, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', progress: 100 }))
  })

  it('marks download completed when the torrent disappears at 90% progress with auto-remove enabled', async () => {
    mockGetSetting.mockReturnValueOnce('true')
    mockActiveAll.mockReturnValue([makeDl({ torrentName: '', downloadedBytes: 900_000_000 })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 1, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', progress: 100 }))
  })

  it('marks download removed when the torrent disappears below 90% progress with auto-remove enabled', async () => {
    mockGetSetting.mockReturnValueOnce('true')
    mockActiveAll.mockReturnValue([makeDl({ torrentName: '', downloadedBytes: 800_000_000 })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0, removed: 1 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed' }))
  })

  it('marks download removed when a progress-only confirmed torrent (null hash) disappears', async () => {
    mockActiveAll.mockReturnValue([
      makeDl({ torrentHash: null, torrentName: '', progress: 35, downloadedBytes: 350_000_000 })
    ])
    mockGetAllTorrents.mockReturnValue([])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0, removed: 1 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed' }))
  })

  it('recovers the torrent hash from the magnet link and backfills it', async () => {
    const recoveredHash = 'a'.repeat(40)
    mockActiveAll.mockReturnValue([
      makeDl({ torrentHash: null, torrentName: '', magnetLink: `magnet:?xt=urn:btih:${recoveredHash}` })
    ])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: recoveredHash, name: 'Recovered Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 0, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ torrentHash: recoveredHash }))
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ torrentName: 'Recovered Movie', progress: 50 }))
  })

  it('returns empty result without querying qBittorrent when no active downloads', async () => {
    mockActiveAll.mockReturnValue([])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0, removed: 0 })
    expect(mockGetAllTorrents).not.toHaveBeenCalled()
  })

  it('matches the torrent by name when the hash is missing and backfills the hash', async () => {
    mockActiveAll.mockReturnValue([makeDl({ torrentName: 'Movie 2024', downloadedBytes: 500_000_000 })])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'h2', name: 'Movie 2024 REMAKE', progress: 0.5 })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 0, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ torrentHash: 'h2' }))
  })

  it('returns early without updates when the qBittorrent fetch fails', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockRejectedValueOnce(new Error('offline'))

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0, removed: 0 })
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

  it('stores -1 when qBittorrent has not reported a seed count yet', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ num_seeds: -1, num_complete: -1, dlspeed: 0, dlspeed_avg: 0 })])

    await syncTorrentStatus()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ numSeeds: -1 }))
  })

  it('falls back to num_complete when num_seeds is unknown but peers completed', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ num_seeds: -1, num_complete: 3 })])

    await syncTorrentStatus()

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ numSeeds: 3 }))
  })

  it('does not warn for an unknown seed count while downloading', async () => {
    mockActiveAll.mockReturnValue([makeDl()])
    mockGetAllTorrents.mockReturnValue([makeQbit({ num_seeds: -1, num_complete: -1 })])

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

  it('matches a null-hash row by its qBittorrent tag and backfills hash and name', async () => {
    mockActiveAll.mockReturnValue([
      makeDl({ torrentHash: null, torrentName: '', magnetLink: '', qbitTag: 'dl-abc12345' })
    ])
    mockGetAllTorrents.mockReturnValue([
      makeQbit({ hash: 'h-tag', name: 'Tagged Movie 2026', tags: 'other-tag, dl-abc12345, extra' })
    ])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 1, completed: 0, failed: 0, removed: 0 })
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ torrentHash: 'h-tag', torrentName: 'Tagged Movie 2026' })
    )
    expect(mockLog.warn).toHaveBeenCalledWith(
      'matched torrent by tag instead of hash: id=dl-1 tag="dl-abc12345" matched_hash=h-tag matched_name="Tagged Movie 2026"'
    )
  })

  it('skips a young download not yet found in qBittorrent instead of failing it', async () => {
    mockActiveAll.mockReturnValue([
      makeDl({
        torrentHash: null,
        torrentName: '',
        magnetLink: '',
        createdAt: new Date(Date.now() - 30_000).toISOString()
      })
    ])
    mockGetAllTorrents.mockReturnValue([makeQbit({ hash: 'other', name: 'Other Movie' })])

    const result = await syncTorrentStatus()

    expect(result).toEqual({ synced: 0, completed: 0, failed: 0, removed: 0 })
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining('skipping young download not yet found in qBittorrent')
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

  it('returns early when no completed downloads are awaiting the ready notification', async () => {
    mockActiveAll.mockReturnValue([
      makeDl({ status: 'completed', completedAt: completedAtPast(), notifiedAt: completedAtPast() })
    ])

    await notifyJellyfinIfNeeded()

    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it('marks notified without touching completedAt when the countdown is disabled and Jellyfin is absent', async () => {
    mockActiveAll.mockReturnValue([makeDl({ status: 'completed', completedAt: completedAtPast() })])
    mockUsersAll.mockReturnValue([{ id: 'u1', username: 'user1', discordId: null }])

    await notifyJellyfinIfNeeded()

    expect(mockSet).toHaveBeenCalledTimes(1)
    expect(mockSet.mock.calls[0]?.[0]).toEqual({ notifiedAt: expect.any(String) })
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
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ notifiedAt: expect.any(String) }))
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

  it('marks notified without notifying when the save path is unknown', async () => {
    mockUseJellyfin.mockReturnValue(mockJellyfin)
    mockActiveAll.mockReturnValue([
      makeDl({ status: 'completed', completedAt: completedAtPast(), savePath: 'unknown' })
    ])

    await notifyJellyfinIfNeeded()

    expect(mockJellyfin.notifyMediaUpdated).not.toHaveBeenCalled()
    expect(mockJellyfin.invalidateLibraryCache).not.toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ notifiedAt: expect.any(String) }))
  })

  it('survives a rejected Jellyfin notification', async () => {
    mockUseJellyfin.mockReturnValue(mockJellyfin)
    mockJellyfin.notifyMediaUpdated.mockRejectedValueOnce(new Error('jellyfin down'))
    mockActiveAll.mockReturnValue([makeDl({ status: 'completed', completedAt: completedAtPast(), savePath: 'movies' })])

    await expect(notifyJellyfinIfNeeded()).resolves.toBeUndefined()

    expect(mockJellyfin.invalidateLibraryCache).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ notifiedAt: expect.any(String) }))
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
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ notifiedAt: expect.any(String) }))
  })
})
