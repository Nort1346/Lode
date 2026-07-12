import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetRouterParam = vi.fn()
const mockGetQuery = vi.fn()
const mockGetSeasonDetails = vi.hoisted(() => vi.fn())
const mockGetTvShowDetails = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockUseProwlarr = vi.hoisted(() => vi.fn())
const mockRankTorrents = vi.hoisted(() => vi.fn())
const mockCheckDailyLimit = vi.hoisted(() => vi.fn())
const mockGetRankingConfig = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getRouterParam', mockGetRouterParam)
vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal(
  'formatSize',
  vi.fn((bytes: number) => `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`)
)

vi.mock('#server/utils/tmdb', () => ({
  getSeasonDetails: mockGetSeasonDetails,
  getTvShowDetails: mockGetTvShowDetails,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/prowlarr', () => ({
  useProwlarr: mockUseProwlarr,
  PROWLARR_CATEGORIES: { MOVIES: 2000, TV: 5000, MUSIC: 3000, BOOKS: 7000 }
}))

vi.mock('#server/utils/torrent-ranker', () => ({
  rankTorrents: mockRankTorrents
}))

vi.mock('#server/utils/limits', () => ({
  checkDailyLimit: mockCheckDailyLimit
}))

vi.mock('#server/utils/ranking-config', () => ({
  getRankingConfig: mockGetRankingConfig
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import handler from '#server/api/browse/tv/[id]/season/[season].get'

describe('browse/tv/[id]/season/[season].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockImplementation((_: unknown, key: string) => {
      if (key === 'id') return '456'
      if (key === 'season') return '1'
      return undefined
    })
    mockGetQuery.mockReturnValue({})
    mockCheckDailyLimit.mockReturnValue({ reached: false, activeCount: 0, todayCount: 0, limit: 10 })
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
    mockGetRankingConfig.mockResolvedValue({})
    mockRankTorrents.mockImplementation((torrents: unknown[]) => torrents)
    mockUseProwlarr.mockReturnValue(null)

    mockGetTvShowDetails.mockResolvedValue({
      id: 456,
      name: 'Test Show',
      original_name: 'Test Show',
      first_air_date: '2024-01-01',
      external_ids: { imdb_id: 'tt1234567' }
    })

    mockGetSeasonDetails.mockResolvedValue({
      season_number: 1,
      name: 'Season 1',
      overview: 'First season',
      poster_path: '/s1.jpg',
      air_date: '2024-01-15',
      episodes: [
        {
          id: 101,
          episode_number: 1,
          name: 'Pilot',
          overview: 'First episode',
          still_path: '/e1.jpg',
          air_date: '2024-01-15',
          vote_average: 8.0,
          runtime: 45
        },
        {
          id: 102,
          episode_number: 2,
          name: 'Second',
          overview: 'Second episode',
          still_path: '/e2.jpg',
          air_date: '2024-01-22',
          vote_average: 7.5,
          runtime: 42
        }
      ]
    })
  })

  const mockEvent = {} as never

  it('returns season details with episodes', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        show: { id: 456, name: 'Test Show' },
        season: expect.objectContaining({ seasonNumber: 1, name: 'Season 1' }),
        episodes: expect.arrayContaining([
          expect.objectContaining({ episodeNumber: 1, name: 'Pilot' }),
          expect.objectContaining({ episodeNumber: 2, name: 'Second' })
        ])
      })
    )
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 400 for invalid show ID', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRouterParam.mockImplementation((_: unknown, key: string) => {
      if (key === 'id') return 'abc'
      if (key === 'season') return '1'
      return undefined
    })

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid show/season ID')
  })

  it('throws 400 for invalid season ID', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRouterParam.mockImplementation((_: unknown, key: string) => {
      if (key === 'id') return '456'
      if (key === 'season') return 'abc'
      return undefined
    })

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid show/season ID')
  })

  it('throws 429 when daily limit reached', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockCheckDailyLimit.mockReturnValue({ reached: true, activeCount: 5, todayCount: 10, limit: 10 })

    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('throws 502 when TMDB fails', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetTvShowDetails.mockRejectedValue(new Error('TMDB down'))

    await expect(handler(mockEvent)).rejects.toThrow('502')
  })

  it('uses locale from query', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({ locale: 'pl' })

    await handler(mockEvent)
    expect(mockGetTvShowDetails).toHaveBeenCalledWith(456, 'pl')
    expect(mockGetSeasonDetails).toHaveBeenCalledWith(456, 1, 'pl')
  })

  it('returns empty episodes when season has no episodes', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetSeasonDetails.mockResolvedValue({
      season_number: 1,
      name: 'Season 1',
      overview: '',
      poster_path: null,
      air_date: null,
      episodes: []
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        episodes: [],
        seasonPacks: []
      })
    )
  })

  it('matches torrents to episodes via episodeRangeMatches', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    const mockProwlarr = { searchTv: vi.fn() }
    mockUseProwlarr.mockReturnValue(mockProwlarr)
    mockProwlarr.searchTv.mockResolvedValue([
      {
        title: 'Show.S01E01.1080p',
        size: 1000,
        seeders: 10,
        leechers: 2,
        indexer: 'Test',
        magnetLink: 'magnet:?xt=urn:btih:aa',
        downloadUrl: null,
        guid: null,
        categories: [5000],
        isPrivate: false
      },
      {
        title: 'Show.S01E02.720p',
        size: 500,
        seeders: 5,
        leechers: 1,
        indexer: 'Test',
        magnetLink: 'magnet:?xt=urn:btih:bb',
        downloadUrl: null,
        guid: null,
        categories: [5000],
        isPrivate: false
      }
    ])
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (
        torrents as Array<{
          title: string
          size: number
          seeders: number
          leechers: number
          indexer: string
          magnetLink: string
          downloadUrl: null
          guid: null
          categories: number[]
          isPrivate: boolean
        }>
      ).map((t) => ({
        ...t,
        score: 100,
        percentage: 100,
        recommended: true,
        parsed: { resolution: '1080p', source: null, language: null }
      }))
    )

    const result = await handler(mockEvent)
    const eps = result as { episodes: Array<{ episodeNumber: number; torrents: unknown[] }> }
    expect(eps.episodes[0]!.torrents).toHaveLength(1)
    expect(eps.episodes[1]!.torrents).toHaveLength(1)
  })

  it('matches season packs via isSeasonPack', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    const mockProwlarr = { searchTv: vi.fn() }
    mockUseProwlarr.mockReturnValue(mockProwlarr)
    mockProwlarr.searchTv.mockResolvedValue([
      {
        title: 'Show.S01.Complete.1080p',
        size: 5000,
        seeders: 20,
        leechers: 3,
        indexer: 'Test',
        magnetLink: 'magnet:?xt=urn:btih:cc',
        downloadUrl: null,
        guid: null,
        categories: [5000],
        isPrivate: false
      }
    ])
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (
        torrents as Array<{
          title: string
          size: number
          seeders: number
          leechers: number
          indexer: string
          magnetLink: string
          downloadUrl: null
          guid: null
          categories: number[]
          isPrivate: boolean
        }>
      ).map((t) => ({
        ...t,
        score: 100,
        percentage: 100,
        recommended: true,
        parsed: { resolution: '1080p', source: null, language: null }
      }))
    )

    const result = await handler(mockEvent)
    const packs = result as { seasonPacks: Array<{ title: string; isSeasonPack: boolean }> }
    expect(packs.seasonPacks).toHaveLength(1)
    expect(packs.seasonPacks[0]!.title).toBe('Show.S01.Complete.1080p')
  })

  it('retries with original_name when first search returns 0 results', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetTvShowDetails.mockResolvedValue({
      id: 456,
      name: 'English Name',
      original_name: 'Original Japanese Name',
      first_air_date: '2024-01-01',
      external_ids: { imdb_id: null }
    })
    const mockProwlarr = { searchTv: vi.fn() }
    mockUseProwlarr.mockReturnValue(mockProwlarr)
    mockProwlarr.searchTv.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        title: 'Original.Ep01',
        size: 1000,
        seeders: 5,
        leechers: 1,
        indexer: 'T',
        magnetLink: 'magnet:?xt=urn:btih:dd',
        downloadUrl: null,
        guid: null,
        categories: [5000],
        isPrivate: false
      }
    ])
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (
        torrents as Array<{
          title: string
          size: number
          seeders: number
          leechers: number
          indexer: string
          magnetLink: string
          downloadUrl: null
          guid: null
          categories: number[]
          isPrivate: boolean
        }>
      ).map((t) => ({
        ...t,
        score: 100,
        percentage: 100,
        recommended: true,
        parsed: { resolution: null, source: null, language: null }
      }))
    )

    await handler(mockEvent)
    expect(mockProwlarr.searchTv).toHaveBeenCalledTimes(2)
    expect(mockProwlarr.searchTv).toHaveBeenNthCalledWith(
      1,
      'English Name',
      'Original Japanese Name',
      '2024',
      null,
      1,
      'en',
      expect.anything()
    )
    expect(mockProwlarr.searchTv).toHaveBeenNthCalledWith(
      2,
      'Original Japanese Name',
      'English Name',
      '2024',
      null,
      1,
      'en',
      expect.anything()
    )
  })
})
