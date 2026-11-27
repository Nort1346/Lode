import { describe, expect, it, vi, beforeEach } from 'vitest'
import { stubUserAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockGetRouterParam = vi.fn()
const mockSetHeader = vi.fn()
const mockUseJellyfin = vi.hoisted(() => vi.fn())
const mockGetItemImage = vi.fn()

vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal('getRouterParam', mockGetRouterParam)
vi.stubGlobal('setHeader', mockSetHeader)
stubUserAuth(mockGetUserSession)

vi.mock('#server/utils/clients/jellyfin', () => ({
  useJellyfin: mockUseJellyfin
}))

import handler from '#server/api/library/image/[id].get'

describe('library/image/[id].get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    mockGetQuery.mockReturnValue({})
    mockGetRouterParam.mockReturnValue('item-1')
    mockUseJellyfin.mockReturnValue({ getItemImage: mockGetItemImage })
    mockGetItemImage.mockResolvedValue({ data: Buffer.from('image'), contentType: 'image/jpeg' })
  })

  const mockEvent = {} as never

  it('requires authentication', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401')
  })

  it('rejects malformed item ids', async () => {
    mockGetRouterParam.mockReturnValue('not a valid id!')

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid item id')
  })

  it('reports a missing Jellyfin configuration', async () => {
    mockUseJellyfin.mockReturnValue(null)

    await expect(handler(mockEvent)).rejects.toThrow('503: Jellyfin is not configured')
  })

  it('returns 404 when the media server has no image for the item', async () => {
    mockGetItemImage.mockResolvedValue(null)

    await expect(handler(mockEvent)).rejects.toThrow('404: Image not found')
  })

  it('returns 404 when the image request fails', async () => {
    mockGetItemImage.mockRejectedValue(new Error('timeout'))

    await expect(handler(mockEvent)).rejects.toThrow('404: Image not found')
  })

  it('streams the image with cache headers', async () => {
    const result = await handler(mockEvent)

    expect(result).toEqual(Buffer.from('image'))
    expect(mockGetItemImage).toHaveBeenCalledWith('item-1', 'Primary', 0, 480)
    expect(mockSetHeader).toHaveBeenCalledWith(mockEvent, 'Content-Type', 'image/jpeg')
    expect(mockSetHeader).toHaveBeenCalledWith(mockEvent, 'Cache-Control', 'private, max-age=604800, immutable')
    expect(mockSetHeader).toHaveBeenCalledWith(mockEvent, 'Content-Length', 5)
  })

  it('clamps the backdrop width and index', async () => {
    mockGetQuery.mockReturnValue({ type: 'Backdrop', index: '99', width: '9999' })

    await handler(mockEvent)

    expect(mockGetItemImage).toHaveBeenCalledWith('item-1', 'Backdrop', 20, 1920)
  })
})
