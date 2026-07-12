import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockGetEnabledCustomTrackerNames = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/prowlarr', () => ({
  getEnabledCustomTrackerNames: mockGetEnabledCustomTrackerNames,
  POLISH_TRACKERS: ['Devil-Torrents', 'Polskie-Torrenty']
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import handler from '#server/api/debug/prowlarr.get'

describe('debug/prowlarr.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({ query: 'test search' })
    mockGetEnabledCustomTrackerNames.mockReturnValue([])
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({
        prowlarrUrl: 'http://prowlarr:9696',
        prowlarrApiKey: 'prow-key'
      }))
    )
    global.fetch = vi.fn()
  })

  const mockEvent = {} as never

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403')
  })

  it('throws 400 when query is missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetQuery.mockReturnValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400')
  })

  it('throws 500 when Prowlarr not configured', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ prowlarrUrl: '', prowlarrApiKey: '' }))
    )

    await expect(handler(mockEvent)).rejects.toThrow('500')
  })

  it('throws 502 when Prowlarr returns error', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(handler(mockEvent)).rejects.toThrow('502')
  })

  it('returns downloadable results with magnet', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            title: 'Test.Movie.2024.1080p.BluRay.x264',
            indexer: 'PublicTracker',
            size: 1500000000,
            seeders: 100,
            leechers: 10,
            magnetUrl: 'magnet:?xt=urn:btih:abc123',
            downloadUrl: null,
            guid: 'guid-1',
            categories: [2000],
            infoUrl: 'http://example.com/1'
          }
        ])
    } as Response)

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        query: 'test search',
        rawCount: 1,
        downloadableCount: 1,
        topResults: expect.arrayContaining([
          expect.objectContaining({
            title: 'Test.Movie.2024.1080p.BluRay.x264',
            hasMagnet: true,
            hasDownloadUrl: false
          })
        ])
      })
    )
  })

  it('returns results with downloadUrl', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            title: 'Test.Movie',
            indexer: 'PublicTracker',
            size: 500000000,
            seeders: 50,
            leechers: 5,
            magnetUrl: null,
            downloadUrl: 'http://example.com/download.torrent',
            guid: 'guid-2',
            categories: [2000],
            infoUrl: 'http://example.com/2'
          }
        ])
    } as Response)

    const result = await handler(mockEvent)
    expect(result.topResults[0]).toEqual(expect.objectContaining({ hasMagnet: false, hasDownloadUrl: true }))
  })

  it('filters non-downloadable results', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            title: 'Unreachable',
            indexer: 'PrivateTracker',
            size: 1000000,
            seeders: 1,
            leechers: 0,
            magnetUrl: null,
            downloadUrl: null,
            guid: 'guid-3',
            categories: [],
            infoUrl: 'http://example.com/3'
          }
        ])
    } as Response)

    const result = await handler(mockEvent)
    expect(result.downloadableCount).toBe(0)
    expect(result.filteredCount).toBe(1)
  })

  it('marks Polish trackers as downloadable', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            title: 'Polish.Movie',
            indexer: 'Devil-Torrents',
            size: 1000000,
            seeders: 10,
            leechers: 2,
            magnetUrl: null,
            downloadUrl: null,
            guid: 'guid-4',
            categories: [],
            infoUrl: 'http://example.com/4'
          }
        ])
    } as Response)

    const result = await handler(mockEvent)
    expect(result.downloadableCount).toBe(1)
    expect(result.topResults[0]).toEqual(expect.objectContaining({ isPrivate: true }))
  })

  it('marks custom trackers as downloadable', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetEnabledCustomTrackerNames.mockReturnValue(['MyTracker'])
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            title: 'Custom.Content',
            indexer: 'MyTracker',
            size: 2000000,
            seeders: 5,
            leechers: 1,
            magnetUrl: null,
            downloadUrl: null,
            guid: 'guid-5',
            categories: [],
            infoUrl: 'http://example.com/5'
          }
        ])
    } as Response)

    const result = await handler(mockEvent)
    expect(result.downloadableCount).toBe(1)
    expect(result.topResults[0]).toEqual(expect.objectContaining({ isPrivate: true }))
  })

  it('groups results by indexer', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            title: 'A',
            indexer: 'Tracker1',
            size: 100,
            seeders: 1,
            leechers: 0,
            magnetUrl: 'magnet:?xt=urn:btih:a',
            downloadUrl: null,
            guid: 'g1',
            categories: [],
            infoUrl: ''
          },
          {
            title: 'B',
            indexer: 'Tracker1',
            size: 200,
            seeders: 2,
            leechers: 0,
            magnetUrl: 'magnet:?xt=urn:btih:b',
            downloadUrl: null,
            guid: 'g2',
            categories: [],
            infoUrl: ''
          },
          {
            title: 'C',
            indexer: 'Tracker2',
            size: 300,
            seeders: 3,
            leechers: 0,
            magnetUrl: 'magnet:?xt=urn:btih:c',
            downloadUrl: null,
            guid: 'g3',
            categories: [],
            infoUrl: ''
          }
        ])
    } as Response)

    const result = await handler(mockEvent)
    expect(result.byIndexer).toEqual(
      expect.objectContaining({
        Tracker1: expect.objectContaining({ total: 2, downloadable: 2 }),
        Tracker2: expect.objectContaining({ total: 1, downloadable: 1 })
      })
    )
  })
})
