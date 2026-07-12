import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockReadBody = vi.fn()
const mockGetFreshUser = vi.hoisted(() => vi.fn())
const mockCheckCooldown = vi.hoisted(() => vi.fn())
const mockSetCooldown = vi.hoisted(() => vi.fn())
const mockWithTorrentAddLock = vi.hoisted(() => vi.fn())
const mockUseDb = vi.hoisted(() => vi.fn())
const mockUseQBittorrent = vi.hoisted(() => vi.fn())
const mockIsPrivateTracker = vi.hoisted(() => vi.fn())
const mockGetTrackerType = vi.hoisted(() => vi.fn())
const mockGetTrackerCookieConfig = vi.hoisted(() => vi.fn())
const mockGotScraping = vi.hoisted(() => vi.fn())
const mockGetMovieDetails = vi.hoisted(() => vi.fn())
const mockGetTvShowDetails = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockCheckAllDisks = vi.hoisted(() => vi.fn())
const mockIsDiskCheckEnabled = vi.hoisted(() => vi.fn())
const mockGetDiskMinFreeGb = vi.hoisted(() => vi.fn())
const mockCheckForDangerousFiles = vi.hoisted(() => vi.fn())
const mockLogActivity = vi.hoisted(() => vi.fn())
const mockClearSessionCache = vi.hoisted(() => vi.fn())
const mockPerformTrackerLogin = vi.hoisted(() => vi.fn())
const mockDecryptAES = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('readBody', mockReadBody)
vi.stubGlobal('useDb', mockUseDb)
const mockUseRuntimeConfig = vi.fn()
vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)
vi.stubGlobal('useQBittorrent', mockUseQBittorrent)
vi.stubGlobal('logActivity', mockLogActivity)
vi.stubGlobal(
  'formatSize',
  vi.fn((bytes: number) => `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`)
)

vi.mock('#server/utils/user', () => ({ getFreshUser: mockGetFreshUser }))
vi.mock('#server/utils/mutex', () => ({
  withTorrentAddLock: mockWithTorrentAddLock,
  checkCooldown: mockCheckCooldown,
  setCooldown: mockSetCooldown
}))
vi.mock('#server/utils/prowlarr', () => ({
  isPrivateTracker: mockIsPrivateTracker,
  getTrackerType: mockGetTrackerType,
  getTrackerCookieConfig: mockGetTrackerCookieConfig
}))
vi.mock('got-scraping', () => ({
  gotScraping: mockGotScraping
}))
vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: mockGetMovieDetails,
  getTvShowDetails: mockGetTvShowDetails,
  getImageUrl: mockGetImageUrl
}))
vi.mock('#server/utils/disk', () => ({
  checkAllDisks: mockCheckAllDisks,
  isDiskCheckEnabled: mockIsDiskCheckEnabled,
  getDiskMinFreeGb: mockGetDiskMinFreeGb
}))
vi.mock('#server/utils/safe-download', () => ({
  checkForDangerousFiles: mockCheckForDangerousFiles
}))
vi.mock('#server/utils/tracker-auth', () => ({
  clearSessionCache: mockClearSessionCache,
  performTrackerLogin: mockPerformTrackerLogin
}))
vi.mock('#server/utils/crypto', () => ({
  decryptAES: mockDecryptAES
}))
vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import handler from '#server/api/browse/download.post'

const defaultUser = { id: 'u1', role: 'user', username: 'testuser' }
const adminUser = { id: 'a1', role: 'admin', username: 'admin' }
const defaultFreshUser = {
  activeTorrentLimit: 3,
  dailyDownloadLimit: 10,
  privateTrackerLimit: 5,
  maxTorrentSizeGb: 20
}
const mockQbit = {
  addTorrent: vi.fn(),
  addTorrentFile: vi.fn(),
  deleteTorrent: vi.fn().mockResolvedValue(undefined),
  moveToTop: vi.fn().mockResolvedValue(undefined),
  getTorrentFiles: vi.fn()
}
const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        all: vi.fn(() => []),
        get: vi.fn(() => undefined)
      }))
    }))
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      run: vi.fn()
    }))
  })),
  transaction: vi.fn((fn: () => void) => fn())
}

function stubConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    savePathMovies: '/data/movies',
    savePathSeries: '/data/series',
    savePathGames: '/data/games',
    savePathBooks: '/data/books',
    savePathMusic: '/data/music'
  }
  vi.mocked(mockUseRuntimeConfig).mockReturnValue({ ...defaults, disks: '', ...overrides } as never)
}

const torrentResult = {
  hash: 'abc123',
  name: 'Test.Torrent.1080p',
  size: 1000000000,
  progress: 0,
  eta: 0,
  dlspeed: 0,
  upspeed: 0,
  downloaded: 0
}

describe('browse/download.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: defaultUser })
    mockGetFreshUser.mockReturnValue(defaultFreshUser)
    mockCheckCooldown.mockReturnValue({ ok: true, remainingMs: 0 })
    mockWithTorrentAddLock.mockImplementation(async (fn: () => Promise<unknown>) => fn())
    mockUseDb.mockReturnValue(mockDb)
    mockUseQBittorrent.mockReturnValue(mockQbit)
    mockIsPrivateTracker.mockReturnValue(false)
    mockGetTrackerType.mockReturnValue(null)
    mockIsDiskCheckEnabled.mockReturnValue(false)
    mockCheckForDangerousFiles.mockReturnValue({ safe: true, dangerousFiles: [] })
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
    stubConfig()
    mockDb.select.mockReset()
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => undefined)
        }))
      }))
    } as never)
    mockQbit.addTorrent.mockResolvedValue(torrentResult)
    mockQbit.addTorrentFile.mockResolvedValue({ ...torrentResult, name: 'Test.torrent' })
    mockQbit.getTorrentFiles.mockResolvedValue([{ name: 'file.mkv', size: 1000000 }])
  })

  const mockEvent = {} as never

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })
    await expect(handler(mockEvent)).rejects.toThrow('401')
  })

  it('throws 404 when user not found', async () => {
    mockGetFreshUser.mockReturnValue(undefined)
    await expect(handler(mockEvent)).rejects.toThrow('404')
  })

  it('throws 429 when cooldown active', async () => {
    mockCheckCooldown.mockReturnValue({ ok: false, remainingMs: 3000 })
    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('throws 400 when no magnet/url/guid', async () => {
    mockReadBody.mockResolvedValue({ savePath: 'movies', label: 'test' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 400 for invalid URL prefix', async () => {
    mockReadBody.mockResolvedValue({ downloadUrl: 'ftp://example.com', savePath: 'movies', label: 'test' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 400 for invalid savePath', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'invalid', label: 'test' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 500 when savePath not configured', async () => {
    stubConfig({ savePathMovies: '' })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })
    await expect(handler(mockEvent)).rejects.toThrow('500')
  })

  it('normalizes magnet:// to magnet:', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet://xt=urn:btih:abc', savePath: 'movies', label: 'test' })
    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.addTorrent).toHaveBeenCalledWith(
      'magnet:xt=urn:btih:abc',
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )
  })

  it('throws 429 when active torrent limit reached (non-admin)', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }]),
          get: vi.fn(() => undefined)
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })
    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('throws 429 when daily limit reached (non-admin)', async () => {
    const todayDownloads = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      createdAt: new Date().toISOString(),
      status: 'downloading'
    }))
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => todayDownloads),
          get: vi.fn(() => undefined)
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })
    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('throws 429 when private tracker limit reached (non-admin)', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    const todayDownloads = Array.from({ length: 5 }, (_, i) => ({
      id: `d${i}`,
      createdAt: new Date().toISOString(),
      status: 'downloading',
      isPrivate: true
    }))
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => todayDownloads),
          get: vi.fn(() => undefined)
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })
    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('admin skips all limits', async () => {
    mockGetUserSession.mockResolvedValue({ user: adminUser })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('successful magnet download', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.addTorrent).toHaveBeenCalledWith(
      'magnet:?xt=urn:btih:abc',
      '/data/movies',
      'movies',
      expect.stringMatching(/^dl-/)
    )
  })

  it('successful downloadUrl download', async () => {
    mockReadBody.mockResolvedValue({
      downloadUrl: 'https://example.com/file.torrent',
      savePath: 'series',
      label: 'test'
    })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.addTorrent).toHaveBeenCalledWith(
      'https://example.com/file.torrent',
      '/data/series',
      'series',
      expect.stringMatching(/^dl-/)
    )
  })

  it('throws 502 when qBittorrent fails', async () => {
    mockQbit.addTorrent.mockRejectedValue(new Error('connection refused'))
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await expect(handler(mockEvent)).rejects.toThrow('502')
  })

  it('throws 400 for unknown private tracker', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue(null)
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'UnknownTracker',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 400 for disabled tracker', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: false, cookie: '' })
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'DisabledTracker',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 400 when no cookie configured', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: true, cookie: '' })
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'NoCookieTracker',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 502 when gotScraping fails', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: true, cookie: 'session=abc123' })
    mockGotScraping.mockRejectedValue(new Error('timeout'))
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'Devil-Torrents',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('502')
  })

  it('throws 502 when gotScraping returns non-200', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: true, cookie: 'session=abc123' })
    mockGotScraping.mockResolvedValue({
      statusCode: 403,
      body: Buffer.from('Forbidden'),
      headers: { 'content-type': 'text/plain' }
    })
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'Devil-Torrents',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('502')
  })

  it('throws 401 for empty response from tracker', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: true, cookie: 'session=abc123' })
    mockGotScraping.mockResolvedValue({
      statusCode: 200,
      body: Buffer.alloc(0),
      headers: { 'content-type': 'application/x-bittorrent' }
    })
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'Devil-Torrents',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('401')
  })

  it('throws 401 for HTML response (cookie expired) without login creds', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: true, cookie: 'session=abc123' })
    mockGotScraping.mockResolvedValue({
      statusCode: 200,
      body: Buffer.from('<!DOCTYPE html><html><body>Login</body></html>'),
      headers: { 'content-type': 'text/html' }
    })
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'Devil-Torrents',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('401')
  })

  it('throws 401 when retry login also returns HTML', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: true, cookie: 'session=abc123' })
    const htmlBody = Buffer.from('<!DOCTYPE html><html><body>Login</body></html>')
    mockGotScraping.mockResolvedValue({
      statusCode: 200,
      body: htmlBody,
      headers: { 'content-type': 'text/html' }
    })
    mockPerformTrackerLogin.mockResolvedValue('fresh-cookie')
    mockDecryptAES.mockReturnValue('decrypted-pass')
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => ({
            loginUrl: 'https://tracker.com/login',
            loginUsername: 'user',
            loginPassword: 'encrypted-pass'
          }))
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'Devil-Torrents',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('401')
    expect(mockClearSessionCache).toHaveBeenCalled()
    expect(mockPerformTrackerLogin).toHaveBeenCalled()
  })

  it('throws 401 for invalid torrent (wrong first byte)', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: true, cookie: 'session=abc123' })
    mockGotScraping.mockResolvedValue({
      statusCode: 200,
      body: Buffer.from('NOT A TORRENT FILE'),
      headers: { 'content-type': 'application/x-bittorrent' }
    })
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'Devil-Torrents',
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('401')
  })

  it('successful guid download (private tracker)', async () => {
    mockIsPrivateTracker.mockReturnValue(true)
    mockGetTrackerType.mockReturnValue('guid')
    mockGetTrackerCookieConfig.mockResolvedValue({ enabled: true, cookie: 'session=abc123' })
    const bencode = Buffer.from('d8:intervali1440e')
    mockGotScraping.mockResolvedValue({
      statusCode: 200,
      body: bencode,
      headers: { 'content-type': 'application/x-bittorrent' }
    })
    mockReadBody.mockResolvedValue({
      guid: 'https://tracker.com/dl/123',
      downloadUrl: 'https://tracker.com/dl/123',
      indexer: 'Devil-Torrents',
      savePath: 'movies',
      label: 'test'
    })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.addTorrentFile).toHaveBeenCalled()
  })

  it('throws 413 when torrent too large', async () => {
    const bigTorrent = { ...torrentResult, size: 30 * 1024 * 1024 * 1024 }
    mockQbit.addTorrent.mockResolvedValue(bigTorrent)
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await expect(handler(mockEvent)).rejects.toThrow('413')
    expect(mockQbit.deleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('throws 507 when disk full post-add', async () => {
    mockQbit.addTorrent.mockResolvedValue({ ...torrentResult, size: 10 * 1024 * 1024 * 1024 })
    stubConfig({ disks: '/data' })
    mockIsDiskCheckEnabled.mockReturnValue(true)
    mockGetDiskMinFreeGb.mockReturnValue(10)
    mockCheckAllDisks.mockReturnValue([
      { path: '/data', available: true, freeBytes: 1 * 1024 * 1024 * 1024, freeFormatted: '1.0 GB' }
    ])
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await expect(handler(mockEvent)).rejects.toThrow('507')
    expect(mockQbit.deleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('throws 403 for dangerous files', async () => {
    mockCheckForDangerousFiles.mockReturnValue({ safe: false, dangerousFiles: ['movie.exe', 'setup.bat'] })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await expect(handler(mockEvent)).rejects.toThrow('403')
    expect(mockQbit.deleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('admin calls moveToTop', async () => {
    mockGetUserSession.mockResolvedValue({ user: adminUser })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await handler(mockEvent)
    expect(mockQbit.moveToTop).toHaveBeenCalledWith(['abc123'])
  })

  it('non-admin does not call moveToTop', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await handler(mockEvent)
    expect(mockQbit.moveToTop).not.toHaveBeenCalled()
  })

  it('fetches movie poster from TMDB', async () => {
    mockGetMovieDetails.mockResolvedValue({ poster_path: '/poster.jpg' })
    mockReadBody.mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc',
      savePath: 'movies',
      label: 'test',
      tmdbId: 123,
      mediaType: 'movie'
    })

    await handler(mockEvent)
    expect(mockGetMovieDetails).toHaveBeenCalledWith(123)
  })

  it('fetches tv poster from TMDB', async () => {
    mockGetTvShowDetails.mockResolvedValue({ poster_path: '/poster.jpg' })
    mockReadBody.mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc',
      savePath: 'series',
      label: 'test',
      tmdbId: 456,
      mediaType: 'tv'
    })

    await handler(mockEvent)
    expect(mockGetTvShowDetails).toHaveBeenCalledWith(456)
  })

  it('skips poster when TMDB fails', async () => {
    mockGetMovieDetails.mockRejectedValue(new Error('TMDB down'))
    mockReadBody.mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc',
      savePath: 'movies',
      label: 'test',
      tmdbId: 123,
      mediaType: 'movie'
    })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
  })

  it('logs activity with torrent_add', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await handler(mockEvent)
    expect(mockLogActivity).toHaveBeenCalledWith(mockEvent, expect.objectContaining({ action: 'torrent_add' }))
  })

  it('sets cooldown after validation', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await handler(mockEvent)
    expect(mockSetCooldown).toHaveBeenCalledWith('u1')
  })

  it('returns null torrent when qBittorrent returns null', async () => {
    mockQbit.addTorrent.mockResolvedValue(null)
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
  })

  it('skips dangerous file check when torrent is null', async () => {
    mockQbit.addTorrent.mockResolvedValue(null)
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    await handler(mockEvent)
    expect(mockQbit.getTorrentFiles).not.toHaveBeenCalled()
  })

  it('retries getTorrentFiles up to 5 times when files empty', async () => {
    mockQbit.getTorrentFiles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: 'file.mkv', size: 1000000 }])
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies', label: 'test' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.getTorrentFiles).toHaveBeenCalledTimes(5)
  })
})
