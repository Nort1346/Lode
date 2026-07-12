import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockSearchMovies = vi.hoisted(() => vi.fn())
const mockSearchTvShows = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockMarkInLibrary = vi.hoisted(() => vi.fn())
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  searchMovies: mockSearchMovies,
  searchTvShows: mockSearchTvShows,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/browse-utils', () => ({
  markInLibrary: mockMarkInLibrary
}))

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/browse/search.get'

describe('browse/search.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({ q: 'test' })
    mockGetActiveSyncProviders.mockResolvedValue([])
    mockMarkInLibrary.mockImplementation(async (items: unknown[]) => items)
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
    mockSearchMovies.mockResolvedValue({
      results: [
        {
          id: 1,
          title: 'Test Movie',
          overview: 'overview',
          poster_path: '/p.jpg',
          backdrop_path: '/b.jpg',
          release_date: '2024-01-01',
          vote_average: 7.0,
          genre_ids: [28]
        }
      ]
    })
    mockSearchTvShows.mockResolvedValue({
      results: [
        {
          id: 2,
          name: 'Test Show',
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

  it('returns search results for both movies and tv', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({ id: 1, type: 'movie' }),
          expect.objectContaining({ id: 2, type: 'tv' })
        ]),
        query: 'test',
        page: 1
      })
    )
  })

  it('searches only movies', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({ q: 'test', type: 'movie' })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([expect.objectContaining({ type: 'movie' })])
      })
    )
  })

  it('searches only tv', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({ q: 'test', type: 'tv' })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([expect.objectContaining({ type: 'tv' })])
      })
    )
  })

  it('throws 400 for short query', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({ q: 'a' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Search query must be at least 2 characters')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
