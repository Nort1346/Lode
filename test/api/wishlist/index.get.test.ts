import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockAll = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: vi.fn(), all: mockAll }))
      }))
    }))
  }))
)

vi.mock('h3', () => ({
  defineEventHandler: (fn: unknown) => fn,
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
  }
}))

vi.mock('#server/database/schema', () => ({
  wishlist: { userId: 'userId' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

import handler from '#server/api/wishlist/index.get'

describe('wishlist/index.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns wishlist items for user', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockAll.mockReturnValue([{ id: 'w1', userId: 'u1', mediaType: 'movie', mediaId: 123, mediaTitle: 'Test Movie' }])

    const result = await handler(mockEvent)
    expect(result).toEqual({
      items: [{ id: 'w1', userId: 'u1', mediaType: 'movie', mediaId: 123, mediaTitle: 'Test Movie' }]
    })
  })

  it('returns empty array when no items', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockAll.mockReturnValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual({ items: [] })
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
