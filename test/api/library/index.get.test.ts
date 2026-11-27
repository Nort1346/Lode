import { describe, expect, it, vi, beforeEach } from 'vitest'
import { stubUserAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockUseJellyfin = vi.hoisted(() => vi.fn())
const mockGetLibraryItems = vi.fn()

vi.stubGlobal('getQuery', mockGetQuery)
stubUserAuth(mockGetUserSession)

vi.mock('#server/utils/clients/jellyfin', () => ({
  useJellyfin: mockUseJellyfin
}))

import handler from '#server/api/library/index.get'

const rawMovie = {
  Id: 'movie-1',
  Name: 'Dune',
  Type: 'Movie',
  ProductionYear: 2021,
  Genres: ['Sci-Fi']
}

const rawSeries = {
  Id: 'series-1',
  Name: 'Severance',
  Type: 'Series',
  ProductionYear: 2022,
  RecursiveItemCount: 19,
  ChildCount: 2,
  Genres: ['Drama']
}

describe('library/index.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockUseJellyfin.mockReturnValue({ getLibraryItems: mockGetLibraryItems })
    mockGetLibraryItems.mockResolvedValue([])
  })

  const mockEvent = {} as never

  it('requires authentication', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401')
  })

  it('reports an unconfigured Jellyfin server', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockUseJellyfin.mockReturnValue(null)

    const result = await handler(mockEvent)

    expect(result).toMatchObject({
      configured: false,
      connected: false,
      items: [],
      stats: { movies: 0, series: 0, episodes: 0, genres: 0 }
    })
    expect(typeof result.fetchedAt).toBe('string')
  })

  it('maps movies and series and summarizes the library', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGetLibraryItems.mockResolvedValue([rawMovie, rawSeries, { Id: 'ep-1', Name: 'Pilot', Type: 'Episode' }])

    const result = await handler(mockEvent)

    expect(result.configured).toBe(true)
    expect(result.connected).toBe(true)
    expect(result.items).toHaveLength(2)
    expect(result.items.map((item) => item.type)).toEqual(['movie', 'series'])
    expect(result.stats).toEqual({ movies: 1, series: 1, episodes: 19, genres: 2 })
    expect(mockGetLibraryItems).toHaveBeenCalledWith(false)
  })

  it('returns a disconnected response instead of throwing when Jellyfin fails', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGetLibraryItems.mockRejectedValue(new Error('connection refused'))

    const result = await handler(mockEvent)

    expect(result).toMatchObject({
      configured: true,
      connected: false,
      items: [],
      stats: { movies: 0, series: 0, episodes: 0, genres: 0 }
    })
  })

  it('bypasses the client cache when force is requested', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGetQuery.mockReturnValue({ force: '1' })

    await handler(mockEvent)

    expect(mockGetLibraryItems).toHaveBeenCalledWith(true)
  })
})
