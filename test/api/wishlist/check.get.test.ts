import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet }))
      }))
    }))
  }))
)

vi.mock('#server/database/schema', () => ({
  wishlist: { userId: 'userId', mediaType: 'mediaType', mediaId: 'mediaId' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({}))
}))

import handler from '#server/api/wishlist/check.get'
import { getQuery } from 'h3'

describe('wishlist/check.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns wishlisted true when item exists', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(getQuery).mockReturnValue({ mediaType: 'movie', mediaId: '123' })
    mockGet.mockReturnValue({ id: 'w1', userId: 'u1', mediaType: 'movie', mediaId: 123 })

    const result = await handler(mockEvent)
    expect(result).toEqual({ wishlisted: true, id: 'w1' })
  })

  it('returns wishlisted false when item does not exist', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(getQuery).mockReturnValue({ mediaType: 'movie', mediaId: '123' })
    mockGet.mockReturnValue(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ wishlisted: false, id: null })
  })

  it('throws 400 when missing mediaType', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(getQuery).mockReturnValue({ mediaId: '123' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Missing mediaType or mediaId')
  })

  it('throws 400 when missing mediaId', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(getQuery).mockReturnValue({ mediaType: 'movie' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Missing mediaType or mediaId')
  })

  it('throws 400 for non-numeric mediaId', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(getQuery).mockReturnValue({ mediaType: 'movie', mediaId: 'abc' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Missing mediaType or mediaId')
  })

  it('throws 400 for non-integer mediaId', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(getQuery).mockReturnValue({ mediaType: 'movie', mediaId: '12.5' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Missing mediaType or mediaId')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
