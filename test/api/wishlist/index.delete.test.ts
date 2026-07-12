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
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ run: mockRun }))
    }))
  }))
)

vi.mock('#server/database/schema', () => ({
  wishlist: { id: 'id', userId: 'userId', mediaType: 'mediaType', mediaId: 'mediaId' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({}))
}))

import handler from '#server/api/wishlist/index.delete'
import { readBody } from 'h3'

describe('wishlist/index.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('deletes by id', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue({ id: 'w1', userId: 'u1' })
    vi.mocked(readBody).mockResolvedValue({ id: 'w1' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
  })

  it('throws 404 when item not found by id', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue(undefined)
    vi.mocked(readBody).mockResolvedValue({ id: 'nonexistent' })

    await expect(handler(mockEvent)).rejects.toThrow('404: Not found')
  })

  it('throws 404 when item belongs to different user', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue({ id: 'w1', userId: 'other-user' })
    vi.mocked(readBody).mockResolvedValue({ id: 'w1' })

    await expect(handler(mockEvent)).rejects.toThrow('404: Not found')
  })

  it('deletes by mediaType and mediaId', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(readBody).mockResolvedValue({ mediaType: 'movie', mediaId: 42 })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockRun).toHaveBeenCalled()
  })

  it('throws 400 when missing both id and mediaType/mediaId', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    vi.mocked(readBody).mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400: Missing id or mediaType/mediaId')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
