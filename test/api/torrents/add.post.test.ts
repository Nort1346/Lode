import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn()
const mockAll = vi.fn()
const mockAddTorrent = vi.fn()
const mockAddTorrentFile = vi.fn()
const mockDeleteTorrent = vi.fn()
const mockMoveToTop = vi.fn()
const mockLogActivity = vi.fn()

const mockUseQBittorrent = vi.fn(() => ({
  addTorrent: mockAddTorrent,
  addTorrentFile: mockAddTorrentFile,
  deleteTorrent: mockDeleteTorrent,
  moveToTop: mockMoveToTop
}))

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: mockGet,
          all: mockAll
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: mockRun }))
    })),
    transaction: vi.fn((fn: () => void) => fn())
  }))
)
vi.stubGlobal('logActivity', mockLogActivity)
vi.stubGlobal('parseDeviceName', vi.fn())
vi.stubGlobal('crypto', { randomUUID: () => 'dl-uuid' })
vi.stubGlobal(
  'useRuntimeConfig',
  vi.fn(() => ({
    savePathMovies: '/movies',
    savePathSeries: '/series',
    savePathGames: '/games',
    savePathBooks: '/books',
    savePathMusic: '/music',
    disks: ''
  }))
)
vi.stubGlobal('useQBittorrent', mockUseQBittorrent)
vi.stubGlobal(
  'useQBittorrent',
  vi.fn(() => ({
    addTorrent: mockAddTorrent,
    addTorrentFile: mockAddTorrentFile,
    deleteTorrent: mockDeleteTorrent,
    moveToTop: mockMoveToTop.mockResolvedValue(undefined)
  }))
)

vi.mock('node:crypto', () => ({
  randomUUID: () => 'dl-uuid'
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({}))
}))

vi.mock('#server/utils/user', () => ({
  getFreshUser: vi.fn(() => ({
    id: 'u1',
    canSubmit: true,
    activeTorrentLimit: 3,
    dailyDownloadLimit: 5,
    maxTorrentSizeGb: 20
  }))
}))

vi.mock('#server/database/schema', () => ({
  downloads: { userId: 'userId', status: 'status' },
  users: { id: 'id' }
}))

vi.mock('#server/utils/mutex', () => ({
  withTorrentAddLock: vi.fn((fn: () => Promise<unknown>) => fn()),
  checkCooldown: vi.fn(() => ({ ok: true, remainingMs: 0 })),
  setCooldown: vi.fn()
}))

vi.mock('#server/utils/disk', () => ({
  checkAllDisks: vi.fn(() => []),
  isDiskCheckEnabled: vi.fn(() => false),
  getDiskMinFreeGb: vi.fn(() => 50)
}))

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: vi.fn(() => Promise.resolve({ poster_path: '/poster.jpg' })),
  getTvShowDetails: vi.fn(() => Promise.resolve({ poster_path: '/poster.jpg' })),
  getImageUrl: vi.fn(() => 'https://image.tmdb.org/poster.jpg')
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() }))
}))

import handler from '#server/api/torrents/add.post'
import { readBody } from 'h3'
import { checkCooldown } from '#server/utils/mutex'
import { getFreshUser } from '#server/utils/user'

describe('torrents/add.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAll.mockReturnValue([])
    vi.mocked(checkCooldown).mockReturnValue({ ok: true, remainingMs: 0 })
    mockAddTorrent.mockResolvedValue(undefined)
    mockAddTorrentFile.mockResolvedValue(undefined)
    mockDeleteTorrent.mockResolvedValue(undefined)
    mockMoveToTop.mockResolvedValue(undefined)
    mockUseQBittorrent.mockReturnValue({
      addTorrent: mockAddTorrent,
      addTorrentFile: mockAddTorrentFile,
      deleteTorrent: mockDeleteTorrent,
      moveToTop: mockMoveToTop
    } as never)
  })

  const mockEvent = {} as never

  it('adds torrent via magnet link', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    vi.mocked(readBody).mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc123',
      savePath: 'movies'
    })
    mockAddTorrent.mockResolvedValue({
      hash: 'abc123',
      name: 'Movie',
      size: 1000,
      progress: 0,
      eta: 100,
      dlspeed: 512,
      upspeed: 0,
      downloaded: 0
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ success: true }))
    expect(mockAddTorrent).toHaveBeenCalledWith('magnet:?xt=urn:btih:abc123', '/movies', 'movies', expect.any(String))
  })

  it('adds torrent via file', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    const fileBase64 = Buffer.from('torrent-data').toString('base64')
    vi.mocked(readBody).mockResolvedValue({
      torrentFile: fileBase64,
      fileName: 'movie.torrent',
      savePath: 'movies'
    })
    mockAddTorrentFile.mockResolvedValue({
      hash: 'abc123',
      name: 'Movie',
      size: 1000,
      progress: 0,
      eta: 100,
      dlspeed: 512,
      upspeed: 0,
      downloaded: 0
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ success: true }))
    expect(mockAddTorrentFile).toHaveBeenCalled()
  })

  it('throws 400 when no magnet, file, or url provided', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    vi.mocked(readBody).mockResolvedValue({ savePath: 'movies' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Magnet link, torrent URL, or .torrent file is required')
  })

  it('throws 400 for invalid save path', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    vi.mocked(readBody).mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc123',
      savePath: 'invalid'
    })

    await expect(handler(mockEvent)).rejects.toThrow('400: Valid save path is required')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 403 when user cannot submit', async () => {
    vi.mocked(getFreshUser).mockReturnValueOnce({
      id: 'u1',
      canSubmit: false,
      activeTorrentLimit: 3,
      dailyDownloadLimit: 5,
      maxTorrentSizeGb: 20
    } as never)
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: You do not have permission to submit torrents')
  })

  it('throws 429 on cooldown', async () => {
    vi.mocked(checkCooldown).mockReturnValue({ ok: false, remainingMs: 30000 })
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })

    await expect(handler(mockEvent)).rejects.toThrow('429: Please wait')
  })

  it('calls moveToTop for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin', username: 'admin' } })
    vi.mocked(readBody).mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc123',
      savePath: 'movies'
    })
    mockAddTorrent.mockResolvedValue({
      hash: 'abc123',
      name: 'Movie',
      size: 1000,
      progress: 0,
      eta: 100,
      dlspeed: 512,
      upspeed: 0,
      downloaded: 0
    })

    await handler(mockEvent)
    expect(mockMoveToTop).toHaveBeenCalledWith(['abc123'])
  })

  it('does not call moveToTop for regular user', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    vi.mocked(readBody).mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc123',
      savePath: 'movies'
    })
    mockAddTorrent.mockResolvedValue({
      hash: 'abc123',
      name: 'Movie',
      size: 1000,
      progress: 0,
      eta: 100,
      dlspeed: 512,
      upspeed: 0,
      downloaded: 0
    })

    await handler(mockEvent)
    expect(mockMoveToTop).not.toHaveBeenCalled()
  })

  it('deletes torrent when too large for user', async () => {
    vi.mocked(getFreshUser).mockReturnValueOnce({
      id: 'u1',
      canSubmit: true,
      activeTorrentLimit: 3,
      dailyDownloadLimit: 5,
      maxTorrentSizeGb: 1
    } as never)
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    vi.mocked(readBody).mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc123',
      savePath: 'movies'
    })
    mockAddTorrent.mockResolvedValue({
      hash: 'abc123',
      name: 'Movie',
      size: 2 * 1024 * 1024 * 1024,
      progress: 0,
      eta: 100,
      dlspeed: 512,
      upspeed: 0,
      downloaded: 0
    })
    mockDeleteTorrent.mockResolvedValue(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('413: Torrent too large')
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('logs activity after adding torrent', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    vi.mocked(readBody).mockResolvedValue({
      magnetLink: 'magnet:?xt=urn:btih:abc123',
      savePath: 'movies'
    })
    mockAddTorrent.mockResolvedValue({
      hash: 'abc123',
      name: 'Movie',
      size: 1000,
      progress: 0,
      eta: 100,
      dlspeed: 512,
      upspeed: 0,
      downloaded: 0
    })

    await handler(mockEvent)
    expect(mockLogActivity).toHaveBeenCalledWith(mockEvent, expect.objectContaining({ action: 'torrent_add' }))
  })
})
