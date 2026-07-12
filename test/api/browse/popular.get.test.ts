import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockGetPopularMovies = vi.hoisted(() => vi.fn())
const mockGetPopularTvShows = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockMarkInLibrary = vi.hoisted(() => vi.fn())
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  getPopularMovies: mockGetPopularMovies,
  getPopularTvShows: mockGetPopularTvShows,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/browse-utils', () => ({
  markInLibrary: mockMarkInLibrary
}))

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/browse/popular.get'

describe('browse/popular.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockGetActiveSyncProviders.mockResolvedValue([])
    mockMarkInLibrary.mockImplementation(async (items: unknown[]) => items)
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
    mockGetPopularMovies.mockResolvedValue({
      results: [
        {
          id: 1,
          title: 'Movie 1',
          overview: 'overview',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          release_date: '2024-01-01',
          vote_average: 7.5,
          genre_ids: [28]
        }
      ]
    })
    mockGetPopularTvShows.mockResolvedValue({
      results: [
        {
          id: 2,
          name: 'Show 1',
          overview: 'overview',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          first_air_date: '2024-01-01',
          vote_average: 8.0,
          genre_ids: [18]
        }
      ]
    })
  })

  const mockEvent = {} as never

  it('returns popular movies and tv', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        movies: expect.arrayContaining([expect.objectContaining({ id: 1 })]),
        tv: expect.arrayContaining([expect.objectContaining({ id: 2 })])
      })
    )
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
