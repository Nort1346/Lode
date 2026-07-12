import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockGetMoviesByGenre = vi.hoisted(() => vi.fn())
const mockGetTvByGenre = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockMarkInLibrary = vi.hoisted(() => vi.fn())
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  getMoviesByGenre: mockGetMoviesByGenre,
  getTvByGenre: mockGetTvByGenre,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/browse-utils', () => ({
  markInLibrary: mockMarkInLibrary
}))

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/browse/genre.get'

describe('browse/genre.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({ genreId: '28' })
    mockGetActiveSyncProviders.mockResolvedValue([])
    mockMarkInLibrary.mockImplementation(async (items: unknown[]) => items)
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
    mockGetMoviesByGenre.mockResolvedValue({
      results: [
        {
          id: 1,
          title: 'Action Movie',
          overview: 'An action movie',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          release_date: '2024-01-01',
          vote_average: 7.0
        }
      ]
    })
    mockGetTvByGenre.mockResolvedValue({
      results: [
        {
          id: 2,
          name: 'Action Show',
          overview: 'An action show',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          first_air_date: '2024-01-01',
          vote_average: 7.5
        }
      ]
    })
  })

  const mockEvent = {} as never

  it('returns movies by genre', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: 1 })])
      })
    )
  })

  it('returns tv by genre', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({ genreId: '18', mediaType: 'tv' })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: 2 })])
      })
    )
  })

  it('throws 400 for invalid genreId', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({ genreId: 'abc' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid genreId')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
