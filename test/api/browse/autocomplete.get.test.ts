import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockSearchMovies = vi.hoisted(() => vi.fn())
const mockSearchTvShows = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  searchMovies: mockSearchMovies,
  searchTvShows: mockSearchTvShows,
  getImageUrl: mockGetImageUrl
}))

import handler from '#server/api/browse/autocomplete.get'

const mockEvent = {} as never

describe('browse/autocomplete.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({})
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `img:${path}` : null))
    mockSearchMovies.mockResolvedValue({ results: [] })
    mockSearchTvShows.mockResolvedValue({ results: [] })
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('returns no suggestions for a query shorter than 2 chars', async () => {
    mockGetQuery.mockReturnValue({ q: 'a' })

    await expect(handler(mockEvent)).resolves.toEqual({ suggestions: [] })
    expect(mockSearchMovies).not.toHaveBeenCalled()
    expect(mockSearchTvShows).not.toHaveBeenCalled()
  })

  it('searches only movies for type=movie and skips exact title matches', async () => {
    mockGetQuery.mockReturnValue({ q: 'bat', type: 'movie' })
    mockSearchMovies.mockResolvedValue({
      results: [
        { id: 1, title: 'Batman', poster_path: '/b.jpg', release_date: '2022-01-01' },
        { id: 2, title: 'bat', poster_path: '/x.jpg', release_date: '2021-01-01' }
      ]
    })

    const result = await handler(mockEvent)

    expect(result.suggestions).toEqual([
      { id: 1, title: 'Batman', type: 'movie', posterUrl: 'img:/b.jpg', year: '2022' }
    ])
    expect(mockSearchTvShows).not.toHaveBeenCalled()
  })

  it('searches only tv for type=tv', async () => {
    mockGetQuery.mockReturnValue({ q: 'str', type: 'tv' })
    mockSearchTvShows.mockResolvedValue({
      results: [{ id: 5, name: 'Stranger', poster_path: '/s.jpg', first_air_date: '2016-01-01' }]
    })

    const result = await handler(mockEvent)

    expect(result.suggestions).toEqual([
      { id: 5, title: 'Stranger', type: 'tv', posterUrl: 'img:/s.jpg', year: '2016' }
    ])
    expect(mockSearchMovies).not.toHaveBeenCalled()
  })

  it('merges movies and tv for type=all sorted by newest year first', async () => {
    mockGetQuery.mockReturnValue({ q: 'aa' })
    mockSearchMovies.mockResolvedValue({
      results: [
        { id: 1, title: 'M1', poster_path: '/1', release_date: '2020-01-01' },
        { id: 2, title: 'M2', poster_path: '/2', release_date: '2024-01-01' }
      ]
    })
    mockSearchTvShows.mockResolvedValue({
      results: [{ id: 3, name: 'T1', poster_path: '/3', first_air_date: '2019-01-01' }]
    })

    const result = await handler(mockEvent)

    expect(result.suggestions.map((s) => s.id)).toEqual([2, 1, 3])
  })

  it('returns no suggestions when the search throws', async () => {
    mockGetQuery.mockReturnValue({ q: 'aa' })
    mockSearchMovies.mockRejectedValue(new Error('tmdb down'))

    await expect(handler(mockEvent)).resolves.toEqual({ suggestions: [] })
  })
})
