import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetRouterParam = vi.fn()
const mockGetQuery = vi.fn()
const mockFormatSize = vi.fn()
const mockGetMovieDetails = vi.hoisted(() => vi.fn())
const mockUseProwlarr = vi.hoisted(() => vi.fn())
const mockRankTorrents = vi.hoisted(() => vi.fn())
const mockCheckDailyLimit = vi.hoisted(() => vi.fn())
const mockGetRankingConfig = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getRouterParam', mockGetRouterParam)
vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal('formatSize', mockFormatSize)

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: mockGetMovieDetails
}))

vi.mock('#server/utils/prowlarr', () => ({
  useProwlarr: mockUseProwlarr,
  PROWLARR_CATEGORIES: { MOVIES: 2000, TV: 5000 }
}))

vi.mock('#server/utils/torrents/torrent-ranker', () => ({
  rankTorrents: mockRankTorrents
}))

vi.mock('#server/utils/limits', () => ({
  checkDailyLimit: mockCheckDailyLimit
}))

vi.mock('#server/utils/torrents/ranking-config', () => ({
  getRankingConfig: mockGetRankingConfig
}))

import handler from '#server/api/browse/movie/[id]/torrents.get'

const mockEvent = {} as never
const mockClient = { searchMovie: vi.fn() }

function ranked() {
  return {
    title: 'Ranked',
    size: 1000,
    seeders: 5,
    leechers: 1,
    indexer: 'Tr',
    magnetLink: 'magnet:x',
    downloadUrl: null,
    guid: null,
    score: 80,
    percentage: 80,
    recommended: true,
    parsed: { resolution: '1080p', source: 'WEB', language: 'EN' },
    isPrivate: false
  }
}

describe('browse/movie/[id]/torrents.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRouterParam.mockReturnValue('123')
    mockGetQuery.mockReturnValue({})
    mockCheckDailyLimit.mockResolvedValue({ reached: false, activeCount: 0, todayCount: 0, limit: 10 })
    mockGetRankingConfig.mockResolvedValue({})
    mockFormatSize.mockImplementation((bytes: number) => `${bytes} B`)
    mockRankTorrents.mockReturnValue([])
    mockUseProwlarr.mockReturnValue(null)
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 400 for an invalid movie id', async () => {
    mockGetRouterParam.mockReturnValue('abc')

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid movie ID')
  })

  it('throws 429 when the daily limit is reached', async () => {
    mockCheckDailyLimit.mockResolvedValue({ reached: true, activeCount: 3, todayCount: 9, limit: 10 })

    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('throws 502 when TMDB details fail', async () => {
    mockGetMovieDetails.mockRejectedValue(new Error('tmdb down'))

    await expect(handler(mockEvent)).rejects.toThrow('502: Failed to fetch movie details from TMDB')
  })

  it('returns empty torrents when Prowlarr is not configured', async () => {
    mockGetMovieDetails.mockResolvedValue({
      id: 123,
      title: 'Movie',
      original_title: 'Movie',
      release_date: '2024-01-01'
    })

    const result = await handler(mockEvent)

    expect(result).toEqual({ torrents: [] })
    expect(mockRankTorrents).not.toHaveBeenCalled()
  })

  it('maps ranked torrents and queries Prowlarr for the movie', async () => {
    mockUseProwlarr.mockReturnValue(mockClient)
    mockClient.searchMovie.mockResolvedValue([{ title: 'raw' }])
    mockRankTorrents.mockReturnValue([ranked()])
    mockGetMovieDetails.mockResolvedValue({
      id: 123,
      title: 'Movie',
      original_title: 'Movie',
      release_date: '2024-01-01'
    })

    const result = await handler(mockEvent)

    expect(result.torrents).toHaveLength(1)
    expect(result.torrents[0]).toMatchObject({
      title: 'Ranked',
      sizeFormatted: '1000 B',
      resolution: '1080p',
      source: 'WEB',
      language: 'EN'
    })
    // the 6th argument is the optional progress callback (unused by the JSON endpoint)
    expect(mockClient.searchMovie).toHaveBeenCalledWith('Movie', 'Movie', [], '2024', [2000], undefined)
    expect(mockRankTorrents).toHaveBeenCalledWith([{ title: 'raw' }], 'movie', 'Movie', '2024', {})
  })

  it('passes alternative titles as extra search queries, english first for non-english locale', async () => {
    mockUseProwlarr.mockReturnValue(mockClient)
    mockClient.searchMovie.mockResolvedValue([{ title: 'raw' }])
    mockRankTorrents.mockReturnValue([ranked()])
    mockGetQuery.mockReturnValue({ locale: 'pl' })
    mockGetMovieDetails.mockResolvedValue({
      id: 123,
      title: 'English Title',
      original_title: 'Original Title',
      release_date: '2024-05-05',
      alternative_titles: [
        { title: 'Other Title', iso_639_1: 'pl', type: 4 },
        { title: 'Alt Title', iso_639_1: 'en', type: 4 },
        { title: 'English Title', iso_639_1: 'en', type: 4 }
      ]
    })

    await handler(mockEvent)

    // duplicates of the main titles are dropped, english is prioritized
    expect(mockClient.searchMovie).toHaveBeenCalledWith(
      'English Title',
      'Original Title',
      ['Alt Title', 'Other Title'],
      '2024',
      [2000],
      undefined
    )
  })

  it('swallows Prowlarr failures and returns empty torrents', async () => {
    mockUseProwlarr.mockReturnValue(mockClient)
    mockClient.searchMovie.mockRejectedValue(new Error('prowlarr offline'))
    mockGetMovieDetails.mockResolvedValue({
      id: 123,
      title: 'Movie',
      original_title: 'Movie',
      release_date: '2024-01-01'
    })

    const result = await handler(mockEvent)

    expect(result).toEqual({ torrents: [] })
  })
})
