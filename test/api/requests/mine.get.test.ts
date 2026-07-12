import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)

vi.mock('#server/utils/db', () => ({
  useDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            get: mockGet
          }))
        }))
      }))
    }))
  }))
}))

vi.mock('#server/database/schema', () => ({
  requests: { userId: 'userId', mediaType: 'mediaType', mediaId: 'mediaId', createdAt: 'createdAt' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({}))
}))

import handler from '#server/api/requests/mine.get'
import { getQuery } from 'h3'

describe('requests/mine.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns existing request status', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(getQuery).mockReturnValue({ mediaType: 'movie', mediaId: '123' })
    mockGet.mockReturnValue({ status: 'accepted', adminNote: 'approved' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ status: 'accepted', adminNote: 'approved' })
  })

  it('returns null when no request found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(getQuery).mockReturnValue({ mediaType: 'movie', mediaId: '123' })
    mockGet.mockReturnValue(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ status: null, adminNote: null })
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

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
