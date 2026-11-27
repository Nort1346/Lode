import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockGetWatchSource = vi.fn()
const mockGetActiveSyncProviders = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/sync', () => ({
  getActiveSyncProviders: mockGetActiveSyncProviders
}))

import handler from '#server/api/watch/links.get'

describe('watch/links.get', () => {
  const event = {} as never

  const jellyfinProvider = { name: 'jellyfin', getWatchSource: mockGetWatchSource }
  const plainProvider = { name: 'other' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'alice' } })
    mockGetQuery.mockReturnValue({ tmdbId: '123' })
    mockGetActiveSyncProviders.mockResolvedValue([jellyfinProvider])
    mockGetWatchSource.mockResolvedValue({
      jellyfin: {
        itemId: 'item-1',
        serverId: 'server-1',
        userId: 'user-1',
        externalUrl: 'https://jellyfin.example.com'
      }
    })
  })

  it('requires authentication', async () => {
    mockGetUserSession.mockResolvedValue({ user: null })
    await expect(handler(event)).rejects.toThrow('401: Not authenticated')
  })

  it('rejects an invalid TMDB id', async () => {
    mockGetQuery.mockReturnValue({ tmdbId: 'nope' })
    await expect(handler(event)).rejects.toThrow('400: Invalid tmdbId')
  })

  it('returns no targets when no provider can resolve watch links', async () => {
    mockGetActiveSyncProviders.mockResolvedValue([plainProvider])
    await expect(handler(event)).resolves.toEqual({ available: false, targets: [] })
  })

  it('returns no targets when the item is not in any library', async () => {
    mockGetWatchSource.mockResolvedValue(null)
    await expect(handler(event)).resolves.toEqual({ available: false, targets: [] })
  })

  it('passes the TMDB id and username to each watch provider', async () => {
    await handler(event)
    expect(mockGetWatchSource).toHaveBeenCalledWith(123, 'alice')
  })

  it('returns deep links pointing at the item detail page', async () => {
    const result = await handler(event)
    expect(result.available).toBe(true)
    const urls = result.targets.map((target) => target.url)
    expect(urls).toContain('moonfin://item?id=item-1')
    expect(urls).toContain('jellyfin://server-1/user-1/item/item-1')
    expect(urls).toContain(
      'https://jellyfin.example.com/web/index.html#!/details?id=item-1&context=home&serverId=server-1'
    )
    expect(result.targets.every((target) => target.server === 'jellyfin')).toBe(true)
  })

  it('combines sources from multiple media servers', async () => {
    const plexSource = {
      plex: { machineId: 'machine-1', ratingKey: '42', mediaType: 'movie' as const }
    }
    mockGetActiveSyncProviders.mockResolvedValue([
      jellyfinProvider,
      { name: 'plex', getWatchSource: vi.fn(async () => plexSource) }
    ])

    const result = await handler(event)
    expect(result.targets.map((target) => target.server)).toContain('plex')
    expect(result.targets.map((target) => target.id)).toContain('plex-web')
    expect(result.targets.map((target) => target.id)).toContain('jellyfin-web')
  })

  it('ignores providers that throw while resolving watch links', async () => {
    mockGetWatchSource.mockRejectedValue(new Error('offline'))
    await expect(handler(event)).resolves.toEqual({ available: false, targets: [] })
  })
})
