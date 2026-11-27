import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockUseRuntimeConfig = vi.fn()
const mockGetItemIdByTmdbId = vi.fn()
const mockGetServerId = vi.fn()
const mockGetUserByName = vi.fn()
const mockUseJellyfin = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)

vi.mock('#server/utils/clients/jellyfin', () => ({
  useJellyfin: mockUseJellyfin
}))

import handler from '#server/api/watch/links.get'

describe('watch/links.get', () => {
  const event = {} as never

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'alice' } })
    mockGetQuery.mockReturnValue({ tmdbId: '123' })
    mockUseRuntimeConfig.mockReturnValue({
      jellyfinUrl: 'http://jellyfin:8096',
      jellyfinExternalUrl: 'https://jellyfin.example.com'
    })
    mockGetItemIdByTmdbId.mockResolvedValue('item-1')
    mockGetServerId.mockResolvedValue('server-1')
    mockGetUserByName.mockResolvedValue({ Id: 'user-1', Name: 'alice' })
    mockUseJellyfin.mockReturnValue({
      getItemIdByTmdbId: mockGetItemIdByTmdbId,
      getServerId: mockGetServerId,
      getUserByName: mockGetUserByName
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

  it('returns no targets when Jellyfin is not configured', async () => {
    mockUseJellyfin.mockReturnValue(null)
    await expect(handler(event)).resolves.toEqual({ available: false, targets: [] })
  })

  it('returns no targets when the item is not in the library', async () => {
    mockGetItemIdByTmdbId.mockResolvedValue(null)
    await expect(handler(event)).resolves.toEqual({ available: false, targets: [] })
  })

  it('returns Jellyfin deep links pointing at the item detail page', async () => {
    const result = await handler(event)
    expect(result.available).toBe(true)
    const urls = result.targets.map((target) => target.url)
    expect(urls).toContain('moonfin://item?id=item-1')
    expect(urls).toContain('jellyfin://server-1/user-1/item/item-1')
    expect(urls).toContain(
      'https://jellyfin.example.com/web/index.html#!/details?id=item-1&context=home&serverId=server-1'
    )
  })

  it('falls back to the internal URL and tolerates missing server/user', async () => {
    mockUseRuntimeConfig.mockReturnValue({ jellyfinUrl: 'http://jellyfin:8096', jellyfinExternalUrl: '' })
    mockGetServerId.mockRejectedValue(new Error('offline'))
    mockGetUserByName.mockResolvedValue(null)

    const result = await handler(event)
    expect(result.targets.map((target) => target.id)).not.toContain('swiftfin')
    expect(result.targets.find((target) => target.id === 'jellyfin-web')?.url).toContain(
      'http://jellyfin:8096/web/index.html#!/details?id=item-1'
    )
  })
})
