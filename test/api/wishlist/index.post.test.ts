import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: mockRun }))
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

vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-123' })

import handler from '#server/api/wishlist/index.post'
import { readBody } from 'h3'

describe('wishlist/index.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('adds item to wishlist', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue(undefined)
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test Movie'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'test-uuid-123' })
  })

  it('throws 409 when already in wishlist', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue({ id: 'existing' })
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test Movie'
    })

    await expect(handler(mockEvent)).rejects.toThrow('409: Already in wishlist')
  })

  it('throws 400 when missing required fields', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(readBody).mockResolvedValue({ mediaType: 'movie' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Missing required fields')
  })

  it('throws 400 for invalid media type', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'book',
      mediaId: 123,
      mediaTitle: 'Test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid media type')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
