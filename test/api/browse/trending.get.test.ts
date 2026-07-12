import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockGetTrending = vi.hoisted(() => vi.fn())
const mockGetLogosForItems = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockMarkInLibrary = vi.hoisted(() => vi.fn())
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  getTrending: mockGetTrending,
  getLogosForItems: mockGetLogosForItems,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/browse-utils', () => ({
  markInLibrary: mockMarkInLibrary
}))

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/browse/trending.get'

describe('browse/trending.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockGetActiveSyncProviders.mockResolvedValue([])
    mockMarkInLibrary.mockImplementation(async (items: unknown[]) => items)
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `https://image.tmdb.org${path}` : null))
    mockGetLogosForItems.mockResolvedValue(new Map())
    mockGetTrending.mockResolvedValue([
      {
        id: 1,
        media_type: 'movie',
        title: 'Trending Movie',
        name: 'Trending Movie',
        overview: 'A trending movie',
        poster_path: '/p.jpg',
        backdrop_path: '/b.jpg',
        release_date: '2024-01-01',
        vote_average: 8.5
      }
    ])
  })

  const mockEvent = {} as never

  it('returns trending items', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: 1, title: 'Trending Movie' })])
      })
    )
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
