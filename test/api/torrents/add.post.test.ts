import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockReadBody = vi.fn()
const mockGetFreshUser = vi.hoisted(() => vi.fn())
const mockCheckCooldown = vi.hoisted(() => vi.fn())
const mockSetCooldown = vi.hoisted(() => vi.fn())
const mockWithTorrentAddLock = vi.hoisted(() => vi.fn())
const mockUseDb = vi.hoisted(() => vi.fn())
const mockUseQBittorrent = vi.hoisted(() => vi.fn())
const mockGetMovieDetails = vi.hoisted(() => vi.fn())
const mockGetTvShowDetails = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockCheckAllDisks = vi.hoisted(() => vi.fn())
const mockIsDiskCheckEnabled = vi.hoisted(() => vi.fn())
const mockGetDiskMinFreeGb = vi.hoisted(() => vi.fn())
const mockLogActivity = vi.hoisted(() => vi.fn())

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
vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import handler from '#server/api/torrents/add.post'

const defaultUser = { id: 'u1', role: 'user', username: 'testuser' }
const adminUser = { id: 'a1', role: 'admin', username: 'admin' }
const defaultFreshUser = {
  canSubmit: true,
  activeTorrentLimit: 3,
  dailyDownloadLimit: 10,
  maxTorrentSizeGb: 20
}
// Valid bencoded torrent with an `info` dict (i…e integers + binary pieces) so
// computeTorrentInfoHash succeeds for the uploaded-file branch (same fixture as info-hash.test.ts).
const TORRENT_FIXTURE_HEX =
  '6431303a6372656174656420627931343a73747265616d6875622d7465737431333a6372656174696f6e2064617465693137353030303030303065343a696e666f64363a6c656e677468693130303030303065343a6e616d6533303a54657374204d6f766965203230323620313038307020574542207832363431323a7069656365206c656e6774686932363231343465363a70696563657334303aabababababababababababababababababababababababababababababababababababababababab373a707269766174656931656565'

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
      run: vi.fn(() => ({ changes: 1 }))
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

// Collects bound param values from a drizzle-orm SQL chunk tree (where clauses built with eq/inArray/and)
function collectParamStrings(chunk: unknown, out: string[] = []): string[] {
  if (chunk === null || typeof chunk !== 'object') return out
  if (Array.isArray(chunk)) {
    for (const sub of chunk) {
      collectParamStrings(sub, out)
    }
    return out
  }
  const c = chunk as { value?: unknown; encoder?: unknown; queryChunks?: unknown[] }
  if (c.encoder !== undefined && typeof c.value === 'string') out.push(c.value)
  if (Array.isArray(c.queryChunks)) {
    for (const sub of c.queryChunks) {
      collectParamStrings(sub, out)
    }
  }
  return out
}

describe('torrents/add.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: defaultUser })
    mockGetFreshUser.mockReturnValue(defaultFreshUser)
    mockCheckCooldown.mockReturnValue({ ok: true, remainingMs: 0 })
    mockWithTorrentAddLock.mockImplementation(async (fn: () => Promise<unknown>) => fn())
    mockUseDb.mockReturnValue(mockDb)
    mockUseQBittorrent.mockReturnValue(mockQbit)
    mockIsDiskCheckEnabled.mockReturnValue(false)
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
    mockQbit.addTorrent.mockResolvedValue({
      hash: 'abc123',
      name: 'Test',
      size: 1000000000,
      progress: 0,
      eta: 0,
      dlspeed: 0,
      upspeed: 0,
      downloaded: 0,
      tags: ''
    })
    mockQbit.addTorrentFile.mockResolvedValue({
      hash: 'abc123',
      name: 'Test.torrent',
      size: 1000000000,
      progress: 0,
      eta: 0,
      dlspeed: 0,
      upspeed: 0,
      downloaded: 0,
      tags: ''
    })
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

  it('throws 403 when non-admin cannot submit', async () => {
    mockGetFreshUser.mockReturnValue({ ...defaultFreshUser, canSubmit: false })
    await expect(handler(mockEvent)).rejects.toThrow('403')
  })

  it('allows admin even without canSubmit', async () => {
    mockGetUserSession.mockResolvedValue({ user: adminUser })
    mockGetFreshUser.mockReturnValue({ ...defaultFreshUser, canSubmit: false })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
  })

  it('throws 429 when cooldown active', async () => {
    mockCheckCooldown.mockReturnValue({ ok: false, remainingMs: 3000 })
    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('throws 400 when no magnet/file/url provided', async () => {
    mockReadBody.mockResolvedValue({ savePath: 'movies' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 400 for invalid magnet prefix', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'invalid-magnet', savePath: 'movies' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 400 for invalid downloadUrl', async () => {
    mockReadBody.mockResolvedValue({ downloadUrl: 'ftp://example.com/file.torrent', savePath: 'movies' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 400 for private network downloadUrl (SSRF guard)', async () => {
    mockReadBody.mockResolvedValue({ downloadUrl: 'http://127.0.0.1:8080/file.torrent', savePath: 'movies' })

    await expect(handler(mockEvent)).rejects.toThrow('400: URLs to private/internal networks are not allowed')
    expect(mockQbit.addTorrent).not.toHaveBeenCalled()
  })

  it('throws 400 for numerically encoded private downloadUrl', async () => {
    mockReadBody.mockResolvedValue({ downloadUrl: 'http://2130706433/file.torrent', savePath: 'movies' })

    await expect(handler(mockEvent)).rejects.toThrow('400: URLs to private/internal networks are not allowed')
    expect(mockQbit.addTorrent).not.toHaveBeenCalled()
  })

  it('throws 400 for invalid torrent file extension', async () => {
    mockReadBody.mockResolvedValue({ torrentFile: 'dGVzdA==', fileName: 'file.txt', savePath: 'movies' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 413 for torrent file too large', async () => {
    const bigFile = 'A'.repeat(8 * 1024 * 1024)
    mockReadBody.mockResolvedValue({ torrentFile: bigFile, fileName: 'big.torrent', savePath: 'movies' })
    await expect(handler(mockEvent)).rejects.toThrow('413')
  })

  it('throws 400 for invalid savePath', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'invalid' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 400 when savePath not configured', async () => {
    stubConfig({ savePathMovies: '' })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })
    await expect(handler(mockEvent)).rejects.toThrow('400')
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
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })
    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('throws 429 when daily download limit reached (non-admin)', async () => {
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
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })
    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('successful magnet download', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.addTorrent).toHaveBeenCalledWith(
      'magnet:?xt=urn:btih:abc',
      '/data/movies',
      'movies',
      expect.stringMatching(/^dl-/)
    )
  })

  it('normalizes magnet:// to magnet:', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet://xt=urn:btih:abc', savePath: 'movies' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.addTorrent).toHaveBeenCalledWith(
      'magnet:xt=urn:btih:abc',
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )
  })

  it('successful downloadUrl download', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/octet-stream']])
    })
    mockReadBody.mockResolvedValue({ downloadUrl: 'https://example.com/file.torrent', savePath: 'series' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.addTorrent).toHaveBeenCalledWith(
      'https://example.com/file.torrent',
      '/data/series',
      'series',
      expect.stringMatching(/^dl-/),
      null
    )
    vi.mocked(global.fetch).mockReset()
  })

  it('throws 400 when URL returns HTML', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/html']])
    })
    mockReadBody.mockResolvedValue({ downloadUrl: 'https://example.com/page', savePath: 'movies' })

    await expect(handler(mockEvent)).rejects.toThrow('400')
    vi.mocked(global.fetch).mockReset()
  })

  it('passes URL to qBittorrent even when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    mockReadBody.mockResolvedValue({ downloadUrl: 'https://example.com/file.torrent', savePath: 'movies' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    vi.mocked(global.fetch).mockReset()
  })

  it('successful .torrent file upload', async () => {
    const fileContent = Buffer.from('d8:intervali1440e').toString('base64')
    mockReadBody.mockResolvedValue({ torrentFile: fileContent, fileName: 'test.torrent', savePath: 'music' })

    const result = await handler(mockEvent)
    expect(result).toHaveProperty('success', true)
    expect(mockQbit.addTorrentFile).toHaveBeenCalled()
  })

  it('returns already when an active download with the same magnet hash exists', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => ({ id: 'existing-1' }))
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({ magnetLink: `magnet:?xt=urn:btih:${'a'.repeat(40)}`, savePath: 'movies' })

    const result = await handler(mockEvent)

    expect(result).toEqual({ already: true, id: 'existing-1' })
    expect(mockQbit.addTorrent).not.toHaveBeenCalled()
    expect(mockSetCooldown).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('returns already when the uploaded torrent info-hash has an active download', async () => {
    const fileContent = Buffer.from(TORRENT_FIXTURE_HEX, 'hex').toString('base64')
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => ({ id: 'existing-1' }))
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({ torrentFile: fileContent, fileName: 'test.torrent', savePath: 'movies' })

    const result = await handler(mockEvent)

    expect(result).toEqual({ already: true, id: 'existing-1' })
    expect(mockQbit.addTorrentFile).not.toHaveBeenCalled()
    expect(mockSetCooldown).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('returns already when the same Prowlarr download URL is already active (link check)', async () => {
    const getQueue: unknown[] = [{ id: 'existing-1' }]
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => getQueue.shift())
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc',
      downloadUrl: 'https://prowlarr.example/5/download?apikey=xyz',
      savePath: 'series'
    })

    const result = await handler(mockEvent)

    expect(result).toEqual({ already: true, id: 'existing-1' })
    expect(mockQbit.addTorrent).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('returns already when the same magnet link is stored with a null hash (link check)', async () => {
    const getQueue: unknown[] = [{ id: 'existing-1' }]
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => getQueue.shift())
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    const result = await handler(mockEvent)

    expect(result).toEqual({ already: true, id: 'existing-1' })
    expect(mockQbit.addTorrent).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('returns already when the same uploaded file name is stored (link check)', async () => {
    const getQueue: unknown[] = [{ id: 'existing-1' }]
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => []),
          get: vi.fn(() => getQueue.shift())
        }))
      }))
    } as never)
    mockReadBody.mockResolvedValue({ torrentFile: 'dGVzdA==', fileName: 'bad.torrent', savePath: 'movies' })

    const result = await handler(mockEvent)

    expect(result).toEqual({ already: true, id: 'existing-1' })
    expect(mockQbit.addTorrentFile).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('returns already after add when the stored row has a null hash but a matching tag (tag fallback)', async () => {
    const allQueue: unknown[][] = [[], [], [{ id: 'existing-tag' }]]
    const getQueue: unknown[] = [undefined, undefined]
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => allQueue.shift() ?? []),
          get: vi.fn(() => getQueue.shift())
        }))
      }))
    } as never)
    mockQbit.addTorrent.mockResolvedValue({
      hash: 'abc123',
      name: 'Test',
      size: 1000000000,
      progress: 0,
      eta: 0,
      dlspeed: 0,
      upspeed: 0,
      downloaded: 0,
      tags: 'dl-old1234'
    })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    const result = await handler(mockEvent)

    expect(result).toEqual({ already: true, id: 'existing-tag' })
    expect(mockQbit.addTorrent).toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('passes the magnet hash as knownHash on the downloadUrl path and catches the 409 via tag fallback', async () => {
    const allQueue: unknown[][] = [[], [], [{ id: 'existing-tag' }]]
    const getQueue: unknown[] = [undefined, undefined, undefined]
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => allQueue.shift() ?? []),
          get: vi.fn(() => getQueue.shift())
        }))
      }))
    } as never)
    mockQbit.addTorrent.mockResolvedValue({
      hash: 'abc123',
      name: 'Test',
      size: 1000000000,
      progress: 0,
      eta: 0,
      dlspeed: 0,
      upspeed: 0,
      downloaded: 0,
      tags: 'dl-old1234'
    })
    mockReadBody.mockResolvedValue({
      magnetLink: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
      downloadUrl: 'https://example.com/file.torrent',
      savePath: 'movies'
    })

    const result = await handler(mockEvent)

    expect(mockQbit.addTorrent).toHaveBeenCalledWith(
      'https://example.com/file.torrent',
      '/data/movies',
      'movies',
      expect.stringMatching(/^dl-/),
      'a'.repeat(40)
    )
    expect(result).toEqual({ already: true, id: 'existing-tag' })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('throws 413 when torrent too large', async () => {
    mockQbit.addTorrent.mockResolvedValue({
      hash: 'abc',
      name: 'Huge',
      size: 30 * 1024 * 1024 * 1024,
      progress: 0,
      eta: 0,
      dlspeed: 0,
      upspeed: 0,
      downloaded: 0
    })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    await expect(handler(mockEvent)).rejects.toThrow('413')
    expect(mockQbit.deleteTorrent).toHaveBeenCalledWith('abc', true)
  })

  it('throws 507 when disk full', async () => {
    mockQbit.addTorrent.mockResolvedValue({
      hash: 'abc',
      name: 'Big',
      size: 10 * 1024 * 1024 * 1024,
      progress: 0,
      eta: 0,
      dlspeed: 0,
      upspeed: 0,
      downloaded: 0
    })
    stubConfig({ disks: '/data' })
    mockIsDiskCheckEnabled.mockReturnValue(true)
    mockGetDiskMinFreeGb.mockReturnValue(10)
    mockCheckAllDisks.mockReturnValue([
      { path: '/data', available: true, freeBytes: 1 * 1024 * 1024 * 1024, freeFormatted: '1.0 GB' }
    ])
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    await expect(handler(mockEvent)).rejects.toThrow('507')
    expect(mockQbit.deleteTorrent).toHaveBeenCalledWith('abc', true)
  })

  it('admin calls moveToTop', async () => {
    mockGetUserSession.mockResolvedValue({ user: adminUser })
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    await handler(mockEvent)
    expect(mockQbit.moveToTop).toHaveBeenCalledWith([expect.any(String)])
  })

  it('non-admin does not call moveToTop', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    await handler(mockEvent)
    expect(mockQbit.moveToTop).not.toHaveBeenCalled()
  })

  it('fetches movie poster from TMDB', async () => {
    mockGetMovieDetails.mockResolvedValue({ poster_path: '/poster.jpg' })
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
    mockReadBody.mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc',
      savePath: 'movies',
      tmdbId: 123,
      mediaType: 'movie'
    })

    await handler(mockEvent)
    expect(mockGetMovieDetails).toHaveBeenCalledWith(123)
  })

  it('fetches tv poster from TMDB', async () => {
    mockGetTvShowDetails.mockResolvedValue({ poster_path: '/poster.jpg' })
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
    mockReadBody.mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc',
      savePath: 'series',
      tmdbId: 456,
      mediaType: 'tv'
    })

    await handler(mockEvent)
    expect(mockGetTvShowDetails).toHaveBeenCalledWith(456)
  })

  it('logs activity with torrent_add', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    await handler(mockEvent)
    expect(mockLogActivity).toHaveBeenCalledWith(mockEvent, expect.objectContaining({ action: 'torrent_add' }))
  })

  it('sets cooldown after validation', async () => {
    mockReadBody.mockResolvedValue({ magnetLink: 'magnet:?xt=urn:btih:abc', savePath: 'movies' })

    await handler(mockEvent)
    expect(mockSetCooldown).toHaveBeenCalledWith('u1')
  })

  it('throws 409 when qBittorrent already has the torrent', async () => {
    mockQbit.addTorrent.mockRejectedValue(new Error('Torrent already exists in qBittorrent'))
    mockReadBody.mockResolvedValue({
      magnetLink: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('409: Torrent already exists in qBittorrent')
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('throws 502 for other qBittorrent errors', async () => {
    mockQbit.addTorrent.mockRejectedValue(new Error('connection refused'))
    mockReadBody.mockResolvedValue({
      magnetLink: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
      savePath: 'movies',
      label: 'test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('502: qBittorrent error: connection refused')
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('dedupe queries match pending, downloading, completed and paused (never removed/failed/disk_full)', async () => {
    const clauses: unknown[] = []
    mockDb.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn((clause: unknown) => {
          clauses.push(clause)
          return { all: vi.fn(() => []), get: vi.fn(() => undefined) }
        })
      }))
    } as never)
    mockReadBody.mockResolvedValue({
      magnetLink: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
      savePath: 'movies',
      label: 'test'
    })

    await handler(mockEvent)

    const dedupeClauses = clauses
      .map((clause) => collectParamStrings(clause))
      .filter((params) => params.includes('pending') && params.includes('completed'))
    expect(dedupeClauses.length).toBeGreaterThanOrEqual(1)
    for (const params of dedupeClauses) {
      expect(params).toEqual(expect.arrayContaining(['pending', 'downloading', 'paused', 'completed']))
      expect(params).not.toContain('removed')
      expect(params).not.toContain('failed')
      expect(params).not.toContain('disk_full')
    }
  })
})
