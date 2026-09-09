import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCacheGet = vi.hoisted(() => vi.fn())
const mockCacheSet = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/cache', () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  CACHE_TTL: { TMDB_POPULAR: 3600, TMDB_SEARCH: 600, TMDB_DETAILS: 7200, TMDB_GENRE: 3600 }
}))

import { searchMovies, getMovieDetails, getTrending, getMoviesByGenre, getLogosForItems } from '#server/utils/tmdb'

const mockFetch = vi.fn()

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

const emptySearch = { results: [], page: 1, total_results: 0, total_pages: 0 }

describe('tmdb network helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ tmdbApiKey: 'test-key' }))
    )
  })

  it('searchMovies returns cached results without fetching', async () => {
    mockCacheGet.mockResolvedValue(emptySearch)

    await expect(searchMovies('x')).resolves.toEqual(emptySearch)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('searchMovies throws 503 when the api key is missing', async () => {
    mockCacheGet.mockResolvedValue(null)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ tmdbApiKey: '' }))
    )

    await expect(searchMovies('x')).rejects.toThrow('503: TMDB is not configured')
  })

  it('searchMovies maps a 401 to a 503 key-rejected error', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) } as unknown as Response)

    await expect(searchMovies('x')).rejects.toThrow('503: TMDB API key was rejected')
  })

  it('searchMovies maps other TMDB errors to 502', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)

    await expect(searchMovies('x')).rejects.toThrow('502: TMDB API error 500')
  })

  it('searchMovies fetches, caches and returns results', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(
      okJson({ results: [{ id: 1, title: 'A' }], page: 1, total_results: 1, total_pages: 1 })
    )

    const result = await searchMovies('x')

    expect(result.results).toHaveLength(1)
    expect(mockCacheSet).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]?.[0]).toContain('/search/movie')
  })

  it('getMovieDetails maps the external_ids imdb id', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(okJson({ id: 1, title: 'A', external_ids: { imdb_id: 'tt123' } }))

    await expect(getMovieDetails(1)).resolves.toMatchObject({ imdb_id: 'tt123' })
  })

  it('getMovieDetails defaults imdb_id to null when external_ids is missing', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(okJson({ id: 1, title: 'A' }))

    await expect(getMovieDetails(1)).resolves.toMatchObject({ imdb_id: null })
  })

  it('getTrending returns the trending list', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(okJson({ results: [{ id: 5, media_type: 'movie' }] }))

    await expect(getTrending()).resolves.toEqual([{ id: 5, media_type: 'movie' }])
  })

  it('getMoviesByGenre filters by genre in the discover endpoint', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(okJson(emptySearch))

    await getMoviesByGenre(28)

    const url = mockFetch.mock.calls[0]?.[0] as string
    expect(url).toContain('/discover/movie')
    expect(url).toContain('with_genres=28')
  })

  it('getLogosForItems serves cached logos without fetching', async () => {
    const full = 'https://image.tmdb.org/t/p/original/logo1.jpg'
    mockCacheGet.mockResolvedValue(full)

    const map = await getLogosForItems([{ id: 1, media_type: 'movie' }], 'en')

    expect(map.get(1)).toBe(full)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('getLogosForItems maps the none sentinel to null', async () => {
    mockCacheGet.mockResolvedValue('__none__')

    const map = await getLogosForItems([{ id: 2, media_type: 'tv' }], 'en')

    expect(map.get(2)).toBeNull()
  })

  it('getLogosForItems picks the matching language logo', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(
      okJson({
        logos: [
          { iso_639_1: 'en', file_path: '/en.jpg' },
          { iso_639_1: null, file_path: '/null.jpg' }
        ]
      })
    )

    const map = await getLogosForItems([{ id: 3, media_type: 'movie' }], 'en')

    expect(map.get(3)).toBe('https://image.tmdb.org/t/p/original/en.jpg')
  })

  it('getLogosForItems falls back to the null-language logo when there is no match', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(
      okJson({
        logos: [
          { iso_639_1: 'fr', file_path: '/fr.jpg' },
          { iso_639_1: null, file_path: '/null.jpg' }
        ]
      })
    )

    const map = await getLogosForItems([{ id: 4, media_type: 'movie' }], 'en')

    expect(map.get(4)).toBe('https://image.tmdb.org/t/p/original/null.jpg')
  })

  it('getLogosForItems caches the none sentinel when the images call fails', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)

    const map = await getLogosForItems([{ id: 5, media_type: 'movie' }], 'en')

    expect(map.has(5)).toBe(true)
    expect(map.get(5)).toBeNull()
    expect(mockCacheSet).toHaveBeenCalledWith(expect.any(String), '__none__', 86400)
  })
})
