import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockGetMoviesByGenre = vi.hoisted(() => vi.fn())
const mockGetTvByGenre = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockCacheGet = vi.hoisted(() => vi.fn())
const mockCacheSet = vi.hoisted(() => vi.fn())
const mockFisheryYatesShuffle = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  getMoviesByGenre: mockGetMoviesByGenre,
  getTvByGenre: mockGetTvByGenre,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/cache', () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  CACHE_TTL: { TMDB_GENRE: 3600 }
}))

vi.mock('#server/utils/shuffle', () => ({
  fisherYatesShuffle: mockFisheryYatesShuffle
}))

vi.mock('~~/app/types/locale', () => ({
  SupportedLocale: { PL: 'pl', EN: 'en', DE: 'de', FR: 'fr', ES: 'es' },
  DEFAULT_LOCALE: 'en'
}))

import handler from '#server/api/browse/spotlights.get'

describe('browse/spotlights.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockGetImageUrl.mockImplementation((path: string | null, _size?: string) =>
      path ? `https://image.tmdb.org${path}` : null
    )
    mockCacheGet.mockResolvedValue(null)
    mockCacheSet.mockResolvedValue(undefined)
    mockFisheryYatesShuffle.mockImplementation((arr: unknown[]) => [...arr])
    mockGetMoviesByGenre.mockResolvedValue({ results: [] })
    mockGetTvByGenre.mockResolvedValue({ results: [] })
  })

  const mockEvent = {} as never

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401')
  })

  it('returns spotlights from cache when available', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    const cachedItems = [
      {
        id: 1,
        type: 'movie',
        title: 'Cached Movie',
        overview: '',
        posterUrl: null,
        backdropUrl: 'https://example.com/b.jpg',
        logoUrl: null,
        year: '2024',
        rating: 8.0,
        inLibrary: false
      }
    ]
    mockCacheGet.mockResolvedValue(cachedItems)

    const result = await handler(mockEvent)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual(expect.objectContaining({ title: 'Cached Movie' }))
    expect(mockGetMoviesByGenre).not.toHaveBeenCalled()
    expect(mockGetTvByGenre).not.toHaveBeenCalled()
  })

  it('fetches from TMDB when cache miss', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetMoviesByGenre.mockResolvedValue({
      results: [
        {
          id: 1,
          title: 'Movie 1',
          overview: 'Overview',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          release_date: '2024-01-01',
          vote_average: 7.0
        },
        {
          id: 2,
          title: 'Movie 2',
          overview: 'Overview 2',
          poster_path: '/p2.jpg',
          backdrop_path: '/b2.jpg',
          release_date: '2024-02-01',
          vote_average: 6.5
        }
      ]
    })

    await handler(mockEvent)
    expect(mockCacheSet).toHaveBeenCalled()
  })

  it('deduplicates items by type and id', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockFisheryYatesShuffle.mockReturnValueOnce([
      { type: 'movie', id: 28 },
      { type: 'tv', id: 10759 }
    ])
    mockGetMoviesByGenre.mockResolvedValue({
      results: [
        {
          id: 99,
          title: 'Shared',
          overview: '',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          release_date: '2024',
          vote_average: 7.0
        }
      ]
    })
    mockGetTvByGenre.mockResolvedValue({
      results: [
        {
          id: 99,
          name: 'Shared TV',
          overview: '',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          first_air_date: '2024',
          vote_average: 8.0
        }
      ]
    })

    const result = await handler(mockEvent)
    const ids = result.items.map((i: { id: number; type: string }) => `${i.type}-${i.id}`)
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.items).toHaveLength(2)
  })

  it('uses default locale when query param is invalid', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({ locale: 'invalid' })

    await handler(mockEvent)
    expect(mockCacheGet).toHaveBeenCalledWith('tmdb:spotlights:pool:en')
  })

  it('uses locale from query when valid', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({ locale: 'en' })

    await handler(mockEvent)
    expect(mockCacheGet).toHaveBeenCalledWith('tmdb:spotlights:pool:en')
  })

  it('skips items with null backdropUrl', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetMoviesByGenre.mockResolvedValue({
      results: [
        {
          id: 1,
          title: 'No Backdrop',
          overview: '',
          poster_path: '/p.jpg',
          backdrop_path: null,
          release_date: '2024',
          vote_average: 7.0
        },
        {
          id: 2,
          title: 'Has Backdrop',
          overview: '',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          release_date: '2024',
          vote_average: 7.0
        }
      ]
    })

    const result = await handler(mockEvent)
    expect(result.items.every((i: { backdropUrl: string | null }) => i.backdropUrl !== null)).toBe(true)
  })

  it('throws 502 on TMDB error', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetMoviesByGenre.mockRejectedValue(new Error('TMDB down'))

    await expect(handler(mockEvent)).rejects.toThrow('502')
  })

  it('handles TV genre results', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockFisheryYatesShuffle.mockReturnValueOnce([{ type: 'tv', id: 10759 }])
    mockGetTvByGenre.mockResolvedValue({
      results: [
        {
          id: 10,
          name: 'TV Show',
          overview: 'Overview',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          first_air_date: '2024-03-01',
          vote_average: 8.5
        }
      ]
    })

    const result = await handler(mockEvent)
    expect(result.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 10, type: 'tv', title: 'TV Show' })])
    )
  })
})
