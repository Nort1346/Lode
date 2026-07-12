import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetQuery = vi.fn()
const mockGetLogosForItems = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('#server/utils/tmdb', () => ({
  getLogosForItems: mockGetLogosForItems
}))

import handler from '#server/api/browse/logo.get'

describe('browse/logo.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({ mediaType: 'movie', id: '123' })
  })

  const mockEvent = {} as never

  it('returns logo URL', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    const logoMap = new Map([[123, 'https://logo.example.com/movie.png']])
    mockGetLogosForItems.mockResolvedValue(logoMap)

    const result = await handler(mockEvent)
    expect(result).toEqual({ logoUrl: 'https://logo.example.com/movie.png' })
  })

  it('returns null when no logo', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetLogosForItems.mockResolvedValue(new Map())

    const result = await handler(mockEvent)
    expect(result).toEqual({ logoUrl: null })
  })

  it('throws 400 for invalid params', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetQuery.mockReturnValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid params')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
