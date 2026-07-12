import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetRouterParam = vi.fn()
const mockGetQuery = vi.fn()
const mockGetMovieDetails = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockMarkInLibrary = vi.hoisted(() => vi.fn())
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getRouterParam', mockGetRouterParam)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: mockGetMovieDetails,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/browse-utils', () => ({
  markInLibrary: mockMarkInLibrary
}))

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/browse/movie/[id].get'

describe('browse/movie/[id].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockReturnValue('123')
    mockGetQuery.mockReturnValue({})
    mockGetActiveSyncProviders.mockResolvedValue([])
    mockMarkInLibrary.mockImplementation(async (items: unknown[]) => items)
    mockGetImageUrl.mockImplementation((path: string | null, _size?: string) =>
      path ? `https://image.tmdb.org${path}` : null
    )
  })

  const mockEvent = {} as never

  it('returns movie details', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetMovieDetails.mockResolvedValue({
      id: 123,
      title: 'Test Movie',
      original_title: 'Test Movie',
      overview: 'A test movie',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      release_date: '2024-01-01',
      vote_average: 8.5,
      vote_count: 100,
      runtime: 120,
      genres: [{ id: 28, name: 'Action' }],
      imdb_id: 'tt1234567'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        movie: expect.objectContaining({ id: 123, title: 'Test Movie' })
      })
    )
  })

  it('throws 400 for invalid ID', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRouterParam.mockReturnValue('abc')

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid movie ID')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
