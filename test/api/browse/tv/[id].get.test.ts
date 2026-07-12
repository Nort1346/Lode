import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetRouterParam = vi.fn()
const mockGetQuery = vi.fn()
const mockGetTvShowDetails = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockMarkInLibrary = vi.hoisted(() => vi.fn())
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getRouterParam', mockGetRouterParam)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  getTvShowDetails: mockGetTvShowDetails,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/browse-utils', () => ({
  markInLibrary: mockMarkInLibrary
}))

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/browse/tv/[id].get'

describe('browse/tv/[id].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockReturnValue('456')
    mockGetQuery.mockReturnValue({})
    mockGetActiveSyncProviders.mockResolvedValue([])
    mockMarkInLibrary.mockImplementation(async (items: unknown[]) => items)
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
  })

  const mockEvent = {} as never

  it('returns tv show details', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetTvShowDetails.mockResolvedValue({
      id: 456,
      name: 'Test Show',
      original_name: 'Test Show',
      overview: 'A test show',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      first_air_date: '2024-01-01',
      vote_average: 8.0,
      vote_count: 50,
      genres: [{ id: 18, name: 'Drama' }],
      number_of_seasons: 3,
      number_of_episodes: 30,
      seasons: [
        {
          id: 1,
          season_number: 0,
          name: 'Specials',
          overview: '',
          poster_path: null,
          air_date: '2024-01-01',
          episode_count: 2
        },
        {
          id: 2,
          season_number: 1,
          name: 'Season 1',
          overview: 'First season',
          poster_path: '/s1.jpg',
          air_date: '2024-01-01',
          episode_count: 10
        },
        {
          id: 3,
          season_number: 2,
          name: 'Season 2',
          overview: 'Second season',
          poster_path: '/s2.jpg',
          air_date: '2024-06-01',
          episode_count: 10
        }
      ]
    })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        show: expect.objectContaining({ id: 456, name: 'Test Show' })
      })
    )
    const seasons = (result as { show: { seasons: Array<{ seasonNumber: number }> } }).show.seasons
    expect(seasons).toHaveLength(2)
    expect(seasons.every((s) => s.seasonNumber > 0)).toBe(true)
    expect(seasons.find((s) => s.seasonNumber === 0)).toBeUndefined()
  })

  it('throws 400 for invalid ID', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRouterParam.mockReturnValue('abc')

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid TV show ID')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
